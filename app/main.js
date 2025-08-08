const { Client, GatewayIntentBits } = require('discord.js');
const { chromium } = require('playwright');

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const TARGET_USERNAME = process.env.TARGET_USERNAME;
const IG_SESSION_ID = process.env.IG_SESSION_ID;
const IG_CSRF_TOKEN = process.env.IG_CSRF_TOKEN;
const IG_DS_USER_ID = process.env.IG_DS_USER_ID;

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
let context = null;

// Initialize Discord bot
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('Environment variables check:');
    console.log('- DISCORD_TOKEN:', DISCORD_TOKEN ? 'Set' : 'Missing');
    console.log('- DISCORD_CHANNEL_ID:', DISCORD_CHANNEL_ID || 'Missing');
    console.log('- TARGET_USERNAME:', TARGET_USERNAME || 'Missing');
    console.log('- IG_SESSION_ID:', IG_SESSION_ID ? 'Set' : 'Missing');
    console.log('- IG_CSRF_TOKEN:', IG_CSRF_TOKEN ? 'Set' : 'Missing');
    console.log('- IG_DS_USER_ID:', IG_DS_USER_ID ? 'Set' : 'Missing');
    
    if (!TARGET_USERNAME || !DISCORD_CHANNEL_ID) {
        console.error('❌ Missing required environment variables!');
        process.exit(1);
    }
    
    if (!IG_SESSION_ID || !IG_CSRF_TOKEN || !IG_DS_USER_ID) {
        console.error('❌ Missing Instagram cookie environment variables!');
        sendDiscordMessage('❌ Missing Instagram cookies! Please set IG_SESSION_ID, IG_CSRF_TOKEN, IG_DS_USER_ID')
            .then(() => process.exit(1));
        return;
    }
    
    startMonitoring();
});

// Send Discord message
async function sendDiscordMessage(message) {
    try {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        await channel.send(message);
        console.log('Discord message sent:', message);
    } catch (error) {
        console.error('Failed to send Discord message:', error);
    }
}

// Initialize browser and context
async function initializeBrowser() {
    try {
        console.log('🚀 Launching Playwright browser...');
        
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--disable-features=VizDisplayCompositor'
            ]
        });
        
        context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'zh-TW'
        });
        
        // Add Instagram cookies
        await context.addCookies([
            {
                name: 'sessionid',
                value: IG_SESSION_ID,
                domain: '.instagram.com',
                path: '/',
                httpOnly: true,
                secure: true
            },
            {
                name: 'csrftoken',
                value: IG_CSRF_TOKEN,
                domain: '.instagram.com',
                path: '/',
                httpOnly: false,
                secure: true
            },
            {
                name: 'ds_user_id',
                value: IG_DS_USER_ID,
                domain: '.instagram.com',
                path: '/',
                httpOnly: false,
                secure: true
            }
        ]);
        
        console.log('✅ Browser initialized with Instagram cookies');
        return true;
        
    } catch (error) {
        console.error('❌ Failed to initialize browser:', error);
        return false;
    }
}

// Check live status using Playwright
async function checkLiveStatusWithPlaywright() {
    let page = null;
    
    try {
        console.log(`🔍 Checking @${TARGET_USERNAME} with Playwright...`);
        
        if (!browser || !context) {
            console.log('🔄 Browser not initialized, initializing...');
            const initialized = await initializeBrowser();
            if (!initialized) {
                console.log('❌ Failed to initialize browser');
                return false;
            }
        }
        
        page = await context.newPage();
        
        // Set additional headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
        });
        
        const url = `https://www.instagram.com/${TARGET_USERNAME}/`;
        console.log(`📱 Navigating to: ${url}`);
        
        // Navigate to Instagram profile
        await page.goto(url, { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        console.log('✅ Page loaded, checking for login status...');
        
        // Check if we're logged in
        const loginButton = await page.locator('text=Log in').first();
        const isLoginPage = await loginButton.isVisible().catch(() => false);
        
        if (isLoginPage) {
            console.log('❌ Detected login page - cookies may be invalid');
            return false;
        }
        
        console.log('✅ Successfully logged in to Instagram');
        
        // Wait for profile content to load
        console.log('⏳ Waiting for profile content to load...');
        await page.waitForTimeout(5000);
        
        // Method 1: Look for live badge in Chinese
        console.log('🔍 Method 1: Searching for Chinese live badge...');
        const chineseLiveBadge = page.locator('text=直播').first();
        const hasChineseLive = await chineseLiveBadge.isVisible().catch(() => false);
        
        if (hasChineseLive) {
            console.log('🔴 LIVE DETECTED via Chinese badge: 直播');
            return true;
        }
        
        // Method 2: Look for live badge in English
        console.log('🔍 Method 2: Searching for English live badge...');
        const englishLiveBadge = page.locator('text=LIVE').first();
        const hasEnglishLive = await englishLiveBadge.isVisible().catch(() => false);
        
        if (hasEnglishLive) {
            console.log('🔴 LIVE DETECTED via English badge: LIVE');
            return true;
        }
        
        // Method 3: Look for live badge with specific styles
        console.log('🔍 Method 3: Searching for styled live badges...');
        const styledLiveBadges = [
            'span:has-text("直播")',
            'span:has-text("LIVE")',
            '[style*="border: 2px solid"]:has-text("直播")',
            '[style*="border: 2px solid"]:has-text("LIVE")'
        ];
        
        for (const selector of styledLiveBadges) {
            try {
                const badge = page.locator(selector).first();
                const isVisible = await badge.isVisible().catch(() => false);
                
                if (isVisible) {
                    const badgeText = await badge.textContent().catch(() => '');
                    console.log(`🔴 LIVE DETECTED via styled badge: "${badgeText}" (selector: ${selector})`);
                    return true;
                }
            } catch (error) {
                // Continue to next selector
            }
        }
        
        // Method 4: Check story ring for live indicator
        console.log('🔍 Method 4: Checking story ring for live indicator...');
        
        // Look for story ring with live indicator
        const storyRingSelectors = [
            'canvas',  // Story rings are often drawn on canvas
            '[role="button"]:has(canvas)',  // Story ring buttons
            'div:has(canvas):has-text("直播")',
            'div:has(canvas):has-text("LIVE")'
        ];
        
        for (const selector of storyRingSelectors) {
            try {
                const element = page.locator(selector).first();
                const isVisible = await element.isVisible().catch(() => false);
                
                if (isVisible) {
                    // Check if parent or nearby elements contain live text
                    const parent = element.locator('..'); // Parent element
                    const parentText = await parent.textContent().catch(() => '');
                    
                    if (parentText.includes('直播') || parentText.includes('LIVE')) {
                        console.log(`🔴 LIVE DETECTED via story ring: "${parentText}"`);
                        return true;
                    }
                }
            } catch (error) {
                // Continue to next selector
            }
        }
        
        // Method 5: JavaScript execution to check data
        console.log('🔍 Method 5: Executing JavaScript to check for live data...');
        
        const liveData = await page.evaluate(() => {
            // Check window._sharedData
            if (window._sharedData && window._sharedData.entry_data) {
                const profileData = window._sharedData.entry_data.ProfilePage;
                if (profileData && profileData[0] && profileData[0].graphql) {
                    const user = profileData[0].graphql.user;
                    if (user) {
                        return {
                            is_live: user.is_live,
                            broadcast_status: user.broadcast ? user.broadcast.broadcast_status : null,
                            has_broadcast: !!user.broadcast
                        };
                    }
                }
            }
            
            // Check for live text in DOM
            const liveElements = document.querySelectorAll('*');
            let foundLiveText = false;
            
            for (const el of liveElements) {
                const text = el.textContent || '';
                if ((text === '直播' || text === 'LIVE') && 
                    el.tagName === 'SPAN' && 
                    el.style.border && 
                    el.style.border.includes('2px solid')) {
                    foundLiveText = true;
                    break;
                }
            }
            
            return {
                found_live_text: foundLiveText,
                total_elements_checked: liveElements.length
            };
        });
        
        console.log('📊 JavaScript execution result:', liveData);
        
        if (liveData.is_live === true || 
            liveData.broadcast_status === 'active' ||
            liveData.found_live_text === true) {
            console.log('🔴 LIVE DETECTED via JavaScript execution!');
            return true;
        }
        
        // Method 6: Take screenshot for debugging (optional)
        console.log('📸 Taking screenshot for debugging...');
        await page.screenshot({ 
            path: '/tmp/instagram_debug.png',
            fullPage: false 
        });
        console.log('✅ Screenshot saved to /tmp/instagram_debug.png');
        
        console.log('⚫ No live indicators found');
        return false;
        
    } catch (error) {
        console.error('❌ Error checking live status with Playwright:', error);
        return false;
    } finally {
        if (page) {
            try {
                await page.close();
            } catch (error) {
                console.error('Error closing page:', error);
            }
        }
    }
}

// Clean up browser resources
async function cleanupBrowser() {
    try {
        if (context) {
            await context.close();
            context = null;
        }
        if (browser) {
            await browser.close();
            browser = null;
        }
        console.log('✅ Browser resources cleaned up');
    } catch (error) {
        console.error('❌ Error cleaning up browser:', error);
    }
}

// Main monitoring loop
async function startMonitoring() {
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Playwright)`);
    
    // Initialize browser
    const initialized = await initializeBrowser();
    if (!initialized) {
        const errorMsg = '❌ Failed to initialize Playwright browser!';
        console.error(errorMsg);
        await sendDiscordMessage(errorMsg);
        process.exit(1);
    }
    
    console.log('✅ Playwright browser initialized!');
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Playwright) ✅`);
    
    // Initial check
    console.log('🔎 Performing initial live status check...');
    try {
        const initialStatus = await checkLiveStatusWithPlaywright();
        isLiveNow = initialStatus;
        
        if (initialStatus) {
            await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is currently LIVE! 🎥\nhttps://www.instagram.com/${TARGET_USERNAME}/`);
        } else {
            console.log('✅ Initial check complete - not currently live');
        }
    } catch (error) {
        console.error('❌ Initial check failed:', error);
    }
    
    // Monitor every 2 minutes
    console.log('⏰ Starting monitoring loop (every 2 minutes)...');
    setInterval(async () => {        
        try {
            const currentlyLive = await checkLiveStatusWithPlaywright();
            
            // Status changed to live
            if (currentlyLive && !isLiveNow) {
                isLiveNow = true;
                console.log('🔴 STATUS CHANGE: User went LIVE!');
                await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is now LIVE on Instagram! 🎥\nhttps://www.instagram.com/${TARGET_USERNAME}/`);
            }
            // Status changed to offline
            else if (!currentlyLive && isLiveNow) {
                isLiveNow = false;
                console.log('⚫ STATUS CHANGE: User went offline');
                await sendDiscordMessage(`⚫ @${TARGET_USERNAME} has ended their Instagram Live stream.`);
            }
            // No change
            else {
                console.log(`📊 Status unchanged: ${currentlyLive ? '🔴 LIVE' : '⚫ Offline'}`);
            }
            
        } catch (error) {
            console.error('❌ Error in monitoring loop:', error);
            
            // Try to reinitialize browser if there's an error
            console.log('🔄 Attempting to reinitialize browser...');
            await cleanupBrowser();
            await initializeBrowser();
        }
    }, 2 * 60 * 1000); // Check every 2 minutes
    
    // Cleanup browser every hour to prevent memory leaks
    setInterval(async () => {
        console.log('🔄 Performing hourly browser cleanup...');
        await cleanupBrowser();
        await initializeBrowser();
    }, 60 * 60 * 1000); // Every hour
    
    // Heartbeat every 10 minutes
    setInterval(() => {
        console.log(`💓 Playwright monitor active - @${TARGET_USERNAME} | ${isLiveNow ? '🔴 LIVE' : '⚫ Offline'} | ${new Date().toLocaleString('zh-TW')}`);
    }, 10 * 60 * 1000);
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await cleanupBrowser();
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await cleanupBrowser();
    await client.destroy();
    process.exit(0);
});

// Start the bot
client.login(DISCORD_TOKEN);