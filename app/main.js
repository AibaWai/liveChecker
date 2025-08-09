const { Client, GatewayIntentBits } = require('discord.js');
const puppeteer = require('puppeteer');

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const TARGET_USERNAME = process.env.TARGET_USERNAME;

// Discord client setup
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let isLiveNow = false;
let browser = null;
let page = null;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    startMonitoring();
});

async function sendDiscordMessage(message) {
    try {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        await channel.send(message);
        console.log('Discord message sent:', message);
    } catch (error) {
        console.error('Failed to send Discord message:', error);
    }
}

async function initializeBrowser() {
    try {
        console.log('🚀 Initializing browser...');
        
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        });
        
        page = await browser.newPage();
        
        // Set realistic user agent and viewport
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });
        
        // Block unnecessary resources to speed up loading
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        console.log('✅ Browser initialized successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Failed to initialize browser:', error);
        return false;
    }
}

async function checkLiveStatus() {
    try {
        console.log(`\n🔍 === Checking @${TARGET_USERNAME} live status ===`);
        
        if (!page) {
            throw new Error('Browser not initialized');
        }
        
        const profileUrl = `https://www.instagram.com/${TARGET_USERNAME}/`;
        console.log(`🌐 Navigating to ${profileUrl}`);
        
        // Navigate to profile with timeout
        await page.goto(profileUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        
        // Wait a bit for dynamic content to load
        await page.waitForTimeout(3000);
        
        // Method 1: Check for live badge using multiple selectors
        const liveSelectors = [
            '[aria-label*="直播"]',
            '[aria-label*="Live"]',
            '[aria-label*="LIVE"]',
            'span:contains("直播")',
            'span:contains("LIVE")',
            'div:contains("直播")',
            'div:contains("LIVE")',
            '[data-testid*="live"]',
            '[class*="live"]',
            '.live-badge'
        ];
        
        console.log('🔍 Checking for live indicators...');
        
        for (const selector of liveSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    const text = await page.evaluate(el => el.textContent, element);
                    console.log(`🔴 LIVE DETECTED: Found "${text}" with selector "${selector}"`);
                    return true;
                }
            } catch (e) {
                // Selector not found, continue
            }
        }
        
        // Method 2: Check page content for live indicators
        const pageContent = await page.content();
        const liveKeywords = ['直播', 'LIVE', 'Live', 'En vivo', 'Live now'];
        
        for (const keyword of liveKeywords) {
            // Look for the keyword in specific contexts that indicate live status
            const livePatterns = [
                new RegExp(`<span[^>]*[^>]*>${keyword}</span>`, 'i'),
                new RegExp(`aria-label="[^"]*${keyword}[^"]*"`, 'i'),
                new RegExp(`<div[^>]*live[^>]*>[^<]*${keyword}`, 'i'),
                new RegExp(`${keyword}.*broadcast`, 'i')
            ];
            
            for (const pattern of livePatterns) {
                if (pattern.test(pageContent)) {
                    console.log(`🔴 LIVE DETECTED: Found "${keyword}" in page content`);
                    return true;
                }
            }
        }
        
        // Method 3: Check for live broadcast URL patterns
        const url = page.url();
        if (url.includes('/live/') || url.includes('broadcast')) {
            console.log('🔴 LIVE DETECTED: URL contains live/broadcast');
            return true;
        }
        
        // Method 4: Check for specific Instagram live elements
        try {
            const liveElement = await page.evaluate(() => {
                // Look for elements that typically contain live status
                const elements = document.querySelectorAll('*');
                for (let el of elements) {
                    const text = el.textContent || '';
                    const ariaLabel = el.getAttribute('aria-label') || '';
                    
                    if ((text.includes('直播') || text.includes('LIVE')) && 
                        (el.className.includes('badge') || 
                         el.tagName === 'SPAN' || 
                         ariaLabel.includes('live'))) {
                        return {
                            text: text,
                            className: el.className,
                            tagName: el.tagName,
                            ariaLabel: ariaLabel
                        };
                    }
                }
                return null;
            });
            
            if (liveElement) {
                console.log('🔴 LIVE DETECTED: Found live element:', liveElement);
                return true;
            }
        } catch (e) {
            console.log('⚠️ Error in live element check:', e.message);
        }
        
        console.log('⚫ No live indicators found');
        return false;
        
    } catch (error) {
        console.error('❌ Error checking live status:', error);
        
        // Try to recover by reinitializing browser
        try {
            console.log('🔄 Attempting to recover browser...');
            await closeBrowser();
            await initializeBrowser();
        } catch (recoveryError) {
            console.error('❌ Failed to recover browser:', recoveryError);
        }
        
        return false;
    }
}

async function closeBrowser() {
    try {
        if (page) {
            await page.close();
            page = null;
        }
        if (browser) {
            await browser.close();
            browser = null;
        }
        console.log('🔒 Browser closed');
    } catch (error) {
        console.error('❌ Error closing browser:', error);
    }
}

async function startMonitoring() {
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Puppeteer v3)`);
    
    // Initialize browser
    const browserReady = await initializeBrowser();
    if (!browserReady) {
        const errorMsg = '❌ Failed to initialize browser!';
        console.error(errorMsg);
        await sendDiscordMessage(errorMsg);
        return;
    }
    
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Puppeteer v3) ✅\n\n🌐 使用真實瀏覽器檢測`);
    
    // Initial check
    console.log('🔎 Performing initial live status check...');
    try {
        const initialStatus = await checkLiveStatus();
        isLiveNow = initialStatus;
        
        if (initialStatus) {
            await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is currently LIVE! 🎥\nhttps://www.instagram.com/${TARGET_USERNAME}/`);
        } else {
            console.log('✅ Initial check complete - not currently live');
        }
    } catch (error) {
        console.error('❌ Initial check failed:', error);
    }
    
    // Monitor every 2 minutes (slightly longer to avoid detection)
    console.log('⏰ Starting monitoring loop (every 2 minutes)...');
    setInterval(async () => {
        try {
            const currentlyLive = await checkLiveStatus();
            
            // Status changed to live
            if (currentlyLive && !isLiveNow) {
                isLiveNow = true;
                console.log('🔴 STATUS CHANGE: User went LIVE!');
                await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is now LIVE on Instagram! 🎥\n\n🔗 https://www.instagram.com/${TARGET_USERNAME}/\n\n⏰ 檢測時間: ${new Date().toLocaleString('zh-TW')}`);
            }
            // Status changed to offline
            else if (!currentlyLive && isLiveNow) {
                isLiveNow = false;
                console.log('⚫ STATUS CHANGE: User went offline');
                await sendDiscordMessage(`⚫ @${TARGET_USERNAME} has ended their Instagram Live stream.\n\n⏰ 結束時間: ${new Date().toLocaleString('zh-TW')}`);
            }
            // No change
            else {
                console.log(`📊 Status unchanged: ${currentlyLive ? '🔴 LIVE' : '⚫ Offline'}`);
            }
            
        } catch (error) {
            console.error('❌ Error in monitoring loop:', error);
        }
    }, 2 * 60 * 1000); // Check every 2 minutes
    
    // Heartbeat every 10 minutes
    setInterval(() => {
        console.log(`💓 Puppeteer monitoring active - @${TARGET_USERNAME} | ${isLiveNow ? '🔴 LIVE' : '⚫ Offline'} | ${new Date().toLocaleString('zh-TW')}`);
    }, 10 * 60 * 1000);
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await closeBrowser();
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await closeBrowser();
    await client.destroy();
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    await closeBrowser();
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await closeBrowser();
    process.exit(1);
});

// Start the bot
client.login(DISCORD_TOKEN);