const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

class InstagramLiveMonitor {
    constructor() {
        this.browser = null;
        this.page = null;
        this.discordClient = new Client({ 
            intents: [GatewayIntentBits.Guilds] 
        });
        this.isLive = new Map(); // 追蹤用戶直播狀態
        this.cookiesPath = './cookies.json';
        this.config = this.loadConfig();
        this.lastActivity = Date.now();
        this.healthCheckInterval = 5 * 60 * 1000; // 5分鐘健康檢查
    }

    loadConfig() {
        try {
            return JSON.parse(process.env.CONFIG || fs.readFileSync('./config.json', 'utf8'));
        } catch (error) {
            console.error('配置文件加載失敗:', error);
            return {
                targets: [], // 要監控的Instagram用戶名
                discord: {
                    token: process.env.DISCORD_TOKEN,
                    channelId: process.env.DISCORD_CHANNEL_ID
                },
                checkInterval: 60000, // 1分鐘檢查間隔
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            };
        }
    }

    async init() {
        console.log('🚀 初始化Instagram Live Monitor...');
        
        // 初始化Discord客戶端
        await this.initDiscord();
        
        // 初始化瀏覽器
        await this.initBrowser();
        
        // 開始監控循環
        this.startMonitoring();
        
        // 設置健康檢查
        this.setupHealthCheck();
        
        console.log('✅ Instagram Live Monitor已啟動!');
    }

    async initDiscord() {
        return new Promise((resolve, reject) => {
            this.discordClient.once('ready', () => {
                console.log(`✅ Discord bot已登入: ${this.discordClient.user.tag}`);
                resolve();
            });

            this.discordClient.on('error', (error) => {
                console.error('❌ Discord錯誤:', error);
            });

            this.discordClient.login(this.config.discord.token).catch(reject);
        });
    }

    async initBrowser() {
        console.log('🔧 初始化瀏覽器...');
        
        try {
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            });

            this.page = await this.browser.newPage();
            
            // 設置用戶代理和視窗大小
            await this.page.setUserAgent(this.config.userAgent);
            await this.page.setViewportSize({ width: 1920, height: 1080 });
            
            // 載入cookies（如果存在）
            await this.loadCookies();
            
            console.log('✅ 瀏覽器初始化完成');
        } catch (error) {
            console.error('❌ 瀏覽器初始化失敗:', error);
            throw error;
        }
    }

    async loadCookies() {
        try {
            if (fs.existsSync(this.cookiesPath)) {
                const cookies = JSON.parse(fs.readFileSync(this.cookiesPath, 'utf8'));
                await this.page.context().addCookies(cookies);
                console.log('✅ Cookies載入成功');
            } else {
                console.log('⚠️ 未找到cookies文件，可能需要重新登入');
            }
        } catch (error) {
            console.error('❌ Cookies載入失敗:', error);
        }
    }

    async saveCookies() {
        try {
            const cookies = await this.page.context().cookies();
            fs.writeFileSync(this.cookiesPath, JSON.stringify(cookies, null, 2));
            console.log('✅ Cookies保存成功');
        } catch (error) {
            console.error('❌ Cookies保存失敗:', error);
        }
    }

    async checkInstagramLogin() {
        try {
            await this.page.goto('https://www.instagram.com/', {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // 等待頁面載入
            await this.page.waitForTimeout(3000);

            // 檢查是否需要登入
            const loginButton = await this.page.$('a[href="/accounts/login/"]');
            if (loginButton) {
                console.log('⚠️ 需要登入Instagram');
                return false;
            }

            console.log('✅ Instagram已登入');
            return true;
        } catch (error) {
            console.error('❌ 檢查登入狀態失敗:', error);
            return false;
        }
    }

    async simulateUserActivity() {
        try {
            // 隨機滾動頁面
            await this.page.evaluate(() => {
                window.scrollTo(0, Math.random() * 1000);
            });

            // 隨機移動滑鼠
            await this.page.mouse.move(
                Math.random() * 1920,
                Math.random() * 1080
            );

            this.lastActivity = Date.now();
        } catch (error) {
            console.error('❌ 模擬用戶活動失敗:', error);
        }
    }

    async checkUserLiveStatus(username) {
        try {
            console.log(`🔍 檢查 ${username} 的直播狀態...`);

            // 訪問用戶頁面
            await this.page.goto(`https://www.instagram.com/${username}/`, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            await this.page.waitForTimeout(2000);

            // 檢查是否有LIVE標誌
            const liveIndicators = [
                '[data-testid="user-avatar"] svg[aria-label*="Live"]',
                '.x1lliihq[title*="Live"]',
                'span:has-text("LIVE")',
                '[aria-label*="Live video"]'
            ];

            let isCurrentlyLive = false;

            for (const selector of liveIndicators) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        isCurrentlyLive = true;
                        break;
                    }
                } catch (e) {
                    // 忽略選擇器錯誤
                }
            }

            // 檢查頁面文本中是否包含LIVE相關內容
            if (!isCurrentlyLive) {
                const pageText = await this.page.textContent('body');
                if (pageText && (pageText.includes('LIVE') || pageText.includes('直播中'))) {
                    isCurrentlyLive = true;
                }
            }

            const wasLive = this.isLive.get(username) || false;
            this.isLive.set(username, isCurrentlyLive);

            // 如果狀態改變，發送通知
            if (isCurrentlyLive && !wasLive) {
                await this.sendLiveNotification(username, true);
                console.log(`🔴 ${username} 開始直播!`);
            } else if (!isCurrentlyLive && wasLive) {
                await this.sendLiveNotification(username, false);
                console.log(`⚫ ${username} 結束直播`);
            } else if (isCurrentlyLive) {
                console.log(`🔴 ${username} 仍在直播中`);
            } else {
                console.log(`⚫ ${username} 未在直播`);
            }

            return isCurrentlyLive;
        } catch (error) {
            console.error(`❌ 檢查 ${username} 直播狀態失敗:`, error);
            return false;
        }
    }

    async sendLiveNotification(username, isLive) {
        try {
            const channel = await this.discordClient.channels.fetch(this.config.discord.channelId);
            if (!channel) {
                console.error('❌ 找不到Discord頻道');
                return;
            }

            const embed = {
                color: isLive ? 0xff0000 : 0x808080,
                title: isLive ? '🔴 Instagram直播開始!' : '⚫ Instagram直播結束',
                description: `**${username}** ${isLive ? '開始了直播!' : '結束了直播'}`,
                fields: [
                    {
                        name: '用戶',
                        value: `[@${username}](https://www.instagram.com/${username}/)`,
                        inline: true
                    },
                    {
                        name: '時間',
                        value: new Date().toLocaleString('zh-TW'),
                        inline: true
                    }
                ],
                thumbnail: {
                    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/instagram.png'
                },
                timestamp: new Date().toISOString()
            };

            await channel.send({ embeds: [embed] });
            console.log(`✅ Discord通知已發送: ${username} ${isLive ? '開始' : '結束'}直播`);
        } catch (error) {
            console.error('❌ 發送Discord通知失敗:', error);
        }
    }

    async performHealthCheck() {
        try {
            console.log('🔧 執行健康檢查...');

            // 檢查瀏覽器狀態
            if (!this.browser || !this.browser.isConnected()) {
                console.log('🔄 重新初始化瀏覽器...');
                await this.initBrowser();
            }

            // 檢查頁面狀態
            if (!this.page || this.page.isClosed()) {
                console.log('🔄 重新創建頁面...');
                this.page = await this.browser.newPage();
                await this.page.setUserAgent(this.config.userAgent);
                await this.page.setViewportSize({ width: 1920, height: 1080 });
                await this.loadCookies();
            }

            // 檢查Instagram登入狀態
            const isLoggedIn = await this.checkInstagramLogin();
            if (!isLoggedIn) {
                console.log('⚠️ Instagram登入狀態異常');
            }

            // 保存cookies
            await this.saveCookies();

            console.log('✅ 健康檢查完成');
        } catch (error) {
            console.error('❌ 健康檢查失敗:', error);
        }
    }

    setupHealthCheck() {
        setInterval(async () => {
            await this.performHealthCheck();
        }, this.healthCheckInterval);
    }

    async startMonitoring() {
        console.log('🎯 開始監控循環...');
        
        const monitoringLoop = async () => {
            try {
                for (const username of this.config.targets) {
                    await this.checkUserLiveStatus(username);
                    
                    // 在檢查之間添加延遲以避免被檢測
                    await this.page.waitForTimeout(5000 + Math.random() * 10000);
                    
                    // 模擬用戶活動
                    await this.simulateUserActivity();
                }
            } catch (error) {
                console.error('❌ 監控循環錯誤:', error);
            }
        };

        // 立即執行一次
        await monitoringLoop();
        
        // 設置定期執行
        setInterval(monitoringLoop, this.config.checkInterval);
    }

    async cleanup() {
        console.log('🧹 清理資源...');
        
        try {
            if (this.browser) {
                await this.browser.close();
            }
            if (this.discordClient) {
                this.discordClient.destroy();
            }
        } catch (error) {
            console.error('❌ 清理失敗:', error);
        }
    }
}

// 處理程序退出
process.on('SIGINT', async () => {
    console.log('\n👋 收到退出信號，正在關閉...');
    if (global.monitor) {
        await global.monitor.cleanup();
    }
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ 未捕獲的異常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未處理的Promise拒絕:', reason);
});

// 主函數
async function main() {
    try {
        const monitor = new InstagramLiveMonitor();
        global.monitor = monitor;
        await monitor.init();
    } catch (error) {
        console.error('❌ 應用程序啟動失敗:', error);
        process.exit(1);
    }
}

// 只有在直接運行此文件時才執行main函數
if (require.main === module) {
    main();
}

module.exports = InstagramLiveMonitor;