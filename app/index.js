const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

class InstagramLiveMonitor {
  constructor() {
    this.config = {
      instagram: {
        username: process.env.IG_USERNAME || process.env.INSTAGRAM_USERNAME,
        cookies: this.parseCookies(process.env.IG_COOKIES || process.env.INSTAGRAM_COOKIES)
      },
      discord: {
        webhookUrl: process.env.DISCORD_WEBHOOK_URL,
        channelId: process.env.DISCORD_CHANNEL_ID || process.env.CHANNEL_ID
      },
      monitoring: {
        baseInterval: parseInt(process.env.CHECK_INTERVAL) || 60000, // 60 seconds
        randomRange: 30000, // ±30 seconds
        maxRetries: 3,
        cooldownAfterError: 300000 // 5 minutes
      }
    };

    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.lastStatus = { isLive: false, lastChecked: null };
    this.retryCount = 0;
    
    this.cookieFile = path.join(__dirname, 'cookies.json');
    this.statusFile = path.join(__dirname, 'status.json');
    this.logFile = path.join(__dirname, 'logs', 'monitor.log');

    // Load previous status
    this.loadStatus();
  }

  parseCookies(cookieString) {
    if (!cookieString) return null;
    
    try {
      // Try to parse as JSON array first
      return JSON.parse(cookieString);
    } catch (e) {
      try {
        // If that fails, try to parse as cookie string
        return cookieString.split(';').map(cookie => {
          const [name, ...rest] = cookie.trim().split('=');
          return {
            name,
            value: rest.join('='),
            domain: '.instagram.com',
            path: '/',
            httpOnly: false,
            secure: true,
            sameSite: 'Lax'
          };
        });
      } catch (e2) {
        this.log(`Failed to parse cookies: ${e2.message}`, 'ERROR');
        return null;
      }
    }
  }

  loadStatus() {
    try {
      if (fs.existsSync(this.statusFile)) {
        this.lastStatus = fs.readJsonSync(this.statusFile);
        this.log(`📁 Loaded previous status: ${this.lastStatus.isLive ? 'LIVE' : 'Not Live'}`);
      }
    } catch (error) {
      this.log(`Failed to load status: ${error.message}`, 'WARN');
    }
  }

  saveStatus() {
    try {
      fs.writeJsonSync(this.statusFile, this.lastStatus, { spaces: 2 });
    } catch (error) {
      this.log(`Failed to save status: ${error.message}`, 'ERROR');
    }
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
    
    // Ensure logs directory exists and write to file
    try {
      fs.ensureDirSync(path.dirname(this.logFile));
      fs.appendFileSync(this.logFile, logMessage + '\n');
    } catch (e) {
      // Ignore file write errors
    }
  }

  async simulateUserActivity() {
    try {
      // 模擬用戶活動來保持 session 活躍
      const activities = [
        // 滑鼠移動到不同位置
        () => this.page.hover('header'),
        // 滾動頁面
        () => this.page.evaluate(() => window.scrollBy(0, Math.random() * 200)),
        // 點擊並立即取消搜尋框
        async () => {
          try {
            await this.page.click('input[placeholder*="搜尋"], input[placeholder*="Search"]', { timeout: 2000 });
            await this.page.keyboard.press('Escape');
          } catch (e) { /* 忽略錯誤 */ }
        },
        // 移動滑鼠到隨機位置
        () => this.page.mouse.move(Math.random() * 500, Math.random() * 300)
      ];

      // 30% 機率執行用戶活動
      if (Math.random() < 0.3) {
        const activity = activities[Math.floor(Math.random() * activities.length)];
        await activity();
        await this.page.waitForTimeout(500 + Math.random() * 1000);
        this.log('✨ Simulated user activity to maintain session');
      }
    } catch (error) {
      // 忽略模擬活動的錯誤，不影響主要功能
      this.log(`User activity simulation failed: ${error.message}`, 'DEBUG');
    }
  }

  async checkCookieHealth() {
    try {
      const cookies = await this.page.context().cookies();
      const sessionCookie = cookies.find(c => c.name === 'sessionid');
      
      if (sessionCookie && sessionCookie.expires) {
        const daysLeft = (sessionCookie.expires * 1000 - Date.now()) / (1000 * 60 * 60 * 24);
        
        this.log(`📅 Session cookie expires in ${Math.ceil(daysLeft)} days`);
        
        // 當剩餘時間少於3天時發送警告
        if (daysLeft < 3 && daysLeft > 0) {
          await this.sendCookieWarning(Math.ceil(daysLeft));
        }
      }
    } catch (error) {
      this.log(`Cookie health check failed: ${error.message}`, 'DEBUG');
    }
  }

  async sendCookieWarning(daysLeft) {
    try {
      const embed = {
        title: '⚠️ Cookie 即將過期警告',
        description: `Instagram session 將在 **${daysLeft}** 天後過期！`,
        color: 0xFF6B35, // 橙色警告
        fields: [
          {
            name: '📊 帳號',
            value: `@${this.config.instagram.username}`,
            inline: true
          },
          {
            name: '⏰ 剩餘時間',
            value: `${daysLeft} 天`,
            inline: true
          },
          {
            name: '🔧 需要動作',
            value: '請更新 Instagram cookies',
            inline: false
          }
        ],
        footer: {
          text: 'Instagram Live Monitor - Cookie Warning'
        },
        timestamp: new Date().toISOString()
      };

      await axios.post(this.config.discord.webhookUrl, { embeds: [embed] });
      this.log('📨 Status update sent to Discord');
    } catch (error) {
      this.log(`Failed to send status update: ${error.message}`, 'ERROR');
    }
  }

  getNextCheckInterval() {
    const { baseInterval, randomRange } = this.config.monitoring;
    const randomDelay = Math.random() * randomRange - (randomRange / 2);
    return baseInterval + randomDelay;
  }

  async startMonitoring() {
    this.isRunning = true;
    this.log('🚀 Starting Instagram Live Monitor...');
    this.log(`📺 Monitoring @${this.config.instagram.username} every ~${this.config.monitoring.baseInterval/1000} seconds`);

    // Send initial status
    await this.sendStatusUpdate('healthy');

    // Initialize browser
    if (!(await this.initBrowser())) {
      this.log('Failed to initialize browser, exiting', 'ERROR');
      process.exit(1);
    }

    // Main monitoring loop
    while (this.isRunning) {
      try {
        const liveData = await this.checkInstagramLive();
        
        if (liveData.requiresLogin) {
          this.log('🔑 Authentication required - entering extended cooldown', 'ERROR');
          await this.sendStatusUpdate('authentication_error');
          
          // 延長冷卻時間，等待手動修復
          await this.sleep(this.config.monitoring.cooldownAfterError * 2);
          continue;
        }

        // Check if live status changed
        if (liveData.isLive && !this.lastStatus.isLive) {
          this.log('🎉 Live stream detected! Sending notification...');
          await this.sendDiscordNotification(liveData);
        } else if (!liveData.isLive && this.lastStatus.isLive) {
          this.log('📴 Live stream ended');
          // 可以選擇是否發送直播結束通知
          // await this.sendLiveEndNotification();
        }

        // Update last status
        this.lastStatus = {
          isLive: liveData.isLive,
          lastChecked: liveData.timestamp
        };
        
        // Save status to file
        this.saveStatus();

        // Reset retry count on success
        this.retryCount = 0;

        // Wait for next check
        const nextInterval = this.getNextCheckInterval();
        this.log(`⏱️ Next check in ${Math.round(nextInterval / 1000)} seconds`);
        await this.sleep(nextInterval);

      } catch (error) {
        this.retryCount++;
        this.log(`Monitor error (attempt ${this.retryCount}/${this.config.monitoring.maxRetries}): ${error.message}`, 'ERROR');

        if (this.retryCount >= this.config.monitoring.maxRetries) {
          this.log('Max retries reached, entering cooldown period', 'ERROR');
          await this.sendStatusUpdate('error');
          await this.sleep(this.config.monitoring.cooldownAfterError);
          this.retryCount = 0;

          // Restart browser after cooldown
          try {
            await this.closeBrowser();
            await this.initBrowser();
          } catch (e) {
            this.log(`Failed to restart browser: ${e.message}`, 'ERROR');
          }
        } else {
          // Short delay before retry
          await this.sleep(10000);
        }
      }
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
        this.log('🔒 Browser closed');
      } catch (error) {
        this.log(`Error closing browser: ${error.message}`, 'ERROR');
      }
    }
  }

  async stop() {
    this.isRunning = false;
    this.log('🛑 Stopping monitor...');
    this.saveStatus();
    await this.closeBrowser();
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  if (global.monitor) {
    await global.monitor.stop();
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  if (global.monitor) {
    await global.monitor.stop();
  } else {
    process.exit(0);
  }
});

// Validate configuration
function validateConfig() {
  const required = [
    { key: 'IG_USERNAME', alt: 'INSTAGRAM_USERNAME' },
    { key: 'DISCORD_WEBHOOK_URL', alt: null }
  ];

  for (const { key, alt } of required) {
    if (!process.env[key] && (!alt || !process.env[alt])) {
      console.error(`❌ Missing required environment variable: ${key}${alt ? ` or ${alt}` : ''}`);
      process.exit(1);
    }
  }

  // Check if cookies are provided
  const cookieKey = process.env.IG_COOKIES || process.env.INSTAGRAM_COOKIES;
  if (!cookieKey) {
    console.warn('⚠️ No Instagram cookies provided. This may cause authentication issues.');
  }
}

// Health check endpoint for Koyeb
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      monitoring: global.monitor ? global.monitor.config.instagram.username : 'not started'
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
  console.log(`📡 Health check endpoint: http://localhost:${PORT}/health`);
});

// Start the application
async function main() {
  console.log('🚀 Instagram Live Monitor Starting...');
  
  // Validate configuration
  validateConfig();
  
  const monitor = new InstagramLiveMonitor();
  global.monitor = monitor;
  
  try {
    await monitor.startMonitoring();
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Start monitoring
main().catch(console.error);config.discord.webhookUrl, { 
        embeds: [embed],
        content: `⚠️ **Cookie 警告**: @${this.config.instagram.username} 的 session 即將過期！`
      });

      this.log('📨 Cookie warning sent to Discord');
    } catch (error) {
      this.log(`Failed to send cookie warning: ${error.message}`, 'ERROR');
    }
  }

  async sendCookieExpiredNotification() {
    try {
      const embed = {
        title: '❌ Cookie 已過期',
        description: `無法存取 Instagram，需要更新 cookies！`,
        color: 0xFF0000, // 紅色錯誤
        fields: [
          {
            name: '📊 受影響帳號',
            value: `@${this.config.instagram.username}`,
            inline: true
          },
          {
            name: '📅 狀態',
            value: '需要重新登入',
            inline: true
          },
          {
            name: '🔧 解決方法',
            value: '1. 重新登入 Instagram\n2. 取得新的 cookies\n3. 更新環境變數',
            inline: false
          }
        ],
        footer: {
          text: 'Instagram Live Monitor - Auth Error'
        },
        timestamp: new Date().toISOString()
      };

      await axios.post(this.config.discord.webhookUrl, { 
        embeds: [embed],
        content: `🚨 **緊急通知**: Instagram cookies 已過期，監控已暫停！`
      });

      this.log('📨 Cookie expired notification sent to Discord');
    } catch (error) {
      this.log(`Failed to send cookie expired notification: ${error.message}`, 'ERROR');
    }
  }

  async initBrowser() {
    try {
      this.log('🚀 Initializing browser...');
      
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-extensions'
        ]
      });

      this.page = await this.browser.newPage({
        viewport: { width: 1920, height: 1080 },
        userAgent: this.getRandomUserAgent()
      });

      // Load cookies if available
      await this.loadCookies();

      this.log('✅ Browser initialized successfully');
      return true;
    } catch (error) {
      this.log(`Failed to initialize browser: ${error.message}`, 'ERROR');
      return false;
    }
  }

  getRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  async loadCookies() {
    try {
      let cookies = null;

      // Try to load from environment variable first
      if (this.config.instagram.cookies) {
        cookies = this.config.instagram.cookies;
        this.log('🍪 Loaded cookies from environment variable');
      }
      // Then try to load from file
      else if (await fs.pathExists(this.cookieFile)) {
        cookies = await fs.readJson(this.cookieFile);
        this.log('🍪 Loaded cookies from file');
      }

      if (cookies && Array.isArray(cookies) && cookies.length > 0) {
        await this.page.context().addCookies(cookies);
        this.log(`✅ Added ${cookies.length} cookies to browser context`);
        return true;
      }
    } catch (error) {
      this.log(`Failed to load cookies: ${error.message}`, 'ERROR');
    }
    return false;
  }

  async saveCookies() {
    try {
      const cookies = await this.page.context().cookies();
      await fs.writeJson(this.cookieFile, cookies, { spaces: 2 });
      this.log(`💾 Saved ${cookies.length} cookies to file`);
    } catch (error) {
      this.log(`Failed to save cookies: ${error.message}`, 'ERROR');
    }
  }

  async checkInstagramLive() {
    try {
      if (!this.config.instagram.username) {
        throw new Error('Instagram username not configured');
      }

      const url = `https://www.instagram.com/${this.config.instagram.username}/`;
      this.log(`🔍 Checking Instagram live status for: ${this.config.instagram.username}`);

      // Navigate to user profile
      await this.page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      // Wait a bit to let the page fully load
      await this.page.waitForTimeout(2000 + Math.random() * 3000);

      // 模擬用戶活動
      await this.simulateUserActivity();

      // Check if login is required
      const currentUrl = this.page.url();
      if (currentUrl.includes('/accounts/login') || currentUrl.includes('/challenge/')) {
        this.log('🚨 Login required - cookies may be expired', 'ERROR');
        await this.sendCookieExpiredNotification();
        return { isLive: false, requiresLogin: true };
      }

      // 檢查是否被重定向到登入頁面或其他限制頁面
      if (currentUrl.includes('/accounts/') && !currentUrl.includes(`/${this.config.instagram.username}`)) {
        this.log('🚨 Redirected away from profile - possible authentication issue', 'ERROR');
        await this.sendCookieExpiredNotification();
        return { isLive: false, requiresLogin: true };
      }

      // Look for LIVE badge - try multiple selectors
      const liveSelectors = [
        'div[data-testid="live-badge"]',
        '[aria-label*="LIVE"]',
        'span:has-text("LIVE")',
        'div:has-text("LIVE")',
        '[data-testid*="live"]',
        'span:text-is("LIVE")'
      ];

      let isLive = false;
      for (const selector of liveSelectors) {
        try {
          const liveElement = await this.page.locator(selector).first();
          if (await liveElement.isVisible({ timeout: 2000 })) {
            isLive = true;
            this.log(`🔴 Found LIVE badge using selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Selector didn't match, continue to next one
        }
      }

      // Additional check: look for story with live ring
      if (!isLive) {
        try {
          const storyElement = await this.page.locator('canvas[aria-label*="Story"]').first();
          if (await storyElement.isVisible({ timeout: 2000 })) {
            // Check if the story ring has live indicator colors/animation
            const storyContainer = await this.page.locator('[role="button"] canvas').first();
            if (await storyContainer.isVisible()) {
              // This is a heuristic - live stories often have different styling
              this.log('🔍 Detected potential live story indicator');
            }
          }
        } catch (e) {
          // No story element found
        }
      }

      // Save cookies after successful page load and check cookie health
      await this.saveCookies();
      
      // 每 10 次檢查執行一次 cookie 健康檢查
      if (Math.random() < 0.1) {
        await this.checkCookieHealth();
      }

      const result = {
        isLive,
        timestamp: new Date().toISOString(),
        url: currentUrl,
        requiresLogin: false
      };

      this.log(`🔴 Live status: ${isLive ? 'LIVE' : 'Not Live'}`);
      return result;

    } catch (error) {
      this.log(`Error checking Instagram live: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  async sendDiscordNotification(liveData) {
    try {
      if (!this.config.discord.webhookUrl) {
        this.log('Discord webhook URL not configured', 'WARN');
        return false;
      }

      const embed = {
        title: '🔴 Instagram 正在直播！',
        description: `**${this.config.instagram.username}** 正在 Instagram 上直播！`,
        color: 0xE4405F, // Instagram brand color
        fields: [
          {
            name: '👤 用戶名',
            value: `@${this.config.instagram.username}`,
            inline: true
          },
          {
            name: '🕒 開始時間',
            value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
            inline: true
          },
          {
            name: '🔗 觀看直播',
            value: `[點擊觀看](https://www.instagram.com/${this.config.instagram.username}/live/)`,
            inline: false
          }
        ],
        thumbnail: {
          url: 'https://cdn-icons-png.flaticon.com/512/174/174855.png'
        },
        footer: {
          text: 'Instagram Live Monitor',
          icon_url: 'https://cdn-icons-png.flaticon.com/512/174/174855.png'
        },
        timestamp: new Date().toISOString()
      };

      const payload = {
        embeds: [embed],
        content: `🔴 **正在直播**: @${this.config.instagram.username} 剛開始直播了！`
      };

      const response = await axios.post(this.config.discord.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.status === 204) {
        this.log('📨 Discord notification sent successfully');
        return true;
      }
    } catch (error) {
      this.log(`Failed to send Discord notification: ${error.message}`, 'ERROR');
      return false;
    }
  }

  async sendStatusUpdate(status) {
    try {
      if (!this.config.discord.webhookUrl) return;

      let embed;
      
      if (status === 'authentication_error') {
        embed = {
          title: '🚨 認證錯誤',
          description: '無法存取 Instagram，需要更新 cookies',
          color: 0xFF0000,
          fields: [
            {
              name: '🤖 Bot 狀態',
              value: '❌ 認證失敗',
              inline: true
            },
            {
              name: '👤 監控目標',
              value: `@${this.config.instagram.username}`,
              inline: true
            },
            {
              name: '🔧 需要動作',
              value: '請更新 Instagram cookies',
              inline: false
            }
          ]
        };
      } else {
        embed = {
          title: '📊 監控狀態更新',
          color: status === 'healthy' ? 0x00FF00 : 0xFF0000,
          fields: [
            {
              name: '🤖 Bot 狀態',
              value: status === 'healthy' ? '✅ 正常運行' : '❌ 發生錯誤',
              inline: true
            },
            {
              name: '👤 監控目標',
              value: `@${this.config.instagram.username}`,
              inline: true
            },
            {
              name: '🕒 最後檢查',
              value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
              inline: true
            }
          ]
        };
      }

      embed.footer = { text: 'Instagram Live Monitor' };
      embed.timestamp = new Date().toISOString();

      await axios.post(this.