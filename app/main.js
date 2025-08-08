const { chromium } = require('playwright');
const { Client, GatewayIntentBits } = require('discord.js');

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const IG_USERNAME = process.env.IG_USERNAME;
const IG_SESSION_ID = process.env.IG_SESSION_ID;
const IG_CSRF_TOKEN = process.env.IG_CSRF_TOKEN;
const IG_DS_USER_ID = process.env.IG_DS_USER_ID;
const TARGET_USERNAME = process.env.TARGET_USERNAME;

// Discord client setup
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let browser;
let page;
let isLiveNow = false;
let cookiesValid = true;

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
    
    if (!TARGET_USERNAME) {
        console.error('TARGET_USERNAME is not set!');
        return;
    }
    
    if (!DISCORD_CHANNEL_ID) {
        console.error('DISCORD_CHANNEL_ID is not set!');
        return;
    }
    
    startMonitoring();
});

// Send Discord message
async function sendDiscordMessage(message) {
    try {
        if (!DISCORD_CHANNEL_ID) {
            console.error('DISCORD_CHANNEL_ID not set');
            return;
        }
        
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        if (!channel) {
            console.error('Channel not found or bot has no access');
            return;
        }
        
        await channel.send(message);
        console.log('Discord message sent:', message);
    } catch (error) {
        console.error('Failed to send Discord message:', error);
        if (error.code === 50001) {
            console.error('Bot is missing access to the channel. Please check:');
            console.error('1. Bot is invited to the server');
            console.error('2. Bot has "View Channel" and "Send Messages" permissions');
            console.error('3. Channel ID is correct');
        }
    }
}

// Setup browser with cookies
async function setupBrowser() {
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        page = await context.newPage();
        
        // Set cookies
        await context.addCookies([
            {
                name: 'sessionid',
                value: IG_SESSION_ID,
                domain: '.instagram.com',
                path: '/'
            },
            {
                name: 'csrftoken',
                value: IG_CSRF_TOKEN,
                domain: '.instagram.com',
                path: '/'
            },
            {
                name: 'ds_user_id',
                value: IG_DS_USER_ID,
                domain: '.instagram.com',
                path: '/'
            }
        ]);
        
        console.log('Browser setup completed with cookies');
        return true;
    } catch (error) {
        console.error('Browser setup failed:', error);
        return false;
    }
}

// Check if user is live
async function checkLiveStatus() {
    try {
        // Navigate to target user's profile
        await page.goto(`https://www.instagram.com/${TARGET_USERNAME}/`, {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        // Wait a bit for page to fully load
        await page.waitForTimeout(3000);
        
        // Check for login redirect (cookies expired)
        const currentUrl = page.url();
        if (currentUrl.includes('/accounts/login/')) {
            console.log('Cookies expired - login required');
            cookiesValid = false;
            await sendDiscordMessage('🚨 Instagram cookies expired! Please update the environment variables.');
            return false;
        }
        
        // Look for live indicator
        const liveIndicators = [
            '[aria-label*="live"]',
            'text=LIVE',
            '[data-testid="live-badge"]',
            '.live-badge',
            'svg[aria-label*="Live"]'
        ];
        
        let isCurrentlyLive = false;
        
        for (const selector of liveIndicators) {
            try {
                const element = await page.locator(selector).first();
                if (await element.isVisible({ timeout: 2000 })) {
                    isCurrentlyLive = true;
                    break;
                }
            } catch (e) {
                // Continue checking other selectors
            }
        }
        
        // Also check profile picture for live ring
        try {
            const profilePic = await page.locator('[data-testid="user-avatar"]').first();
            if (await profilePic.isVisible()) {
                const classList = await profilePic.getAttribute('class');
                if (classList && classList.includes('live')) {
                    isCurrentlyLive = true;
                }
            }
        } catch (e) {
            // Ignore
        }
        
        // Check for stories with live badge
        try {
            const storyRing = await page.locator('canvas').first();
            if (await storyRing.isVisible({ timeout: 2000 })) {
                // Look for live text near story
                const liveNearStory = await page.locator('text=Live').first();
                if (await liveNearStory.isVisible({ timeout: 1000 })) {
                    isCurrentlyLive = true;
                }
            }
        } catch (e) {
            // Ignore
        }
        
        console.log(`Live status check: ${isCurrentlyLive ? 'LIVE' : 'NOT LIVE'}`);
        return isCurrentlyLive;
        
    } catch (error) {
        console.error('Error checking live status:', error);
        
        // Check if it's a cookie/auth issue
        if (error.message.includes('login') || page.url().includes('/accounts/login/')) {
            cookiesValid = false;
            await sendDiscordMessage('🚨 Instagram authentication failed! Please update cookies.');
        }
        
        return false;
    }
}

// Main monitoring loop
async function startMonitoring() {
    console.log(`Starting Instagram Live monitoring for @${TARGET_USERNAME}`);
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME}`);
    
    // Setup browser
    if (!await setupBrowser()) {
        await sendDiscordMessage('❌ Failed to setup browser. Retrying in 5 minutes...');
        setTimeout(startMonitoring, 5 * 60 * 1000);
        return;
    }
    
    // Monitor every minute
    setInterval(async () => {
        if (!cookiesValid) {
            console.log('Cookies invalid, skipping check');
            return;
        }
        
        try {
            const currentlyLive = await checkLiveStatus();
            
            // Send notification when going live
            if (currentlyLive && !isLiveNow) {
                isLiveNow = true;
                await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is now LIVE on Instagram! https://www.instagram.com/${TARGET_USERNAME}/`);
            }
            // Send notification when going offline
            else if (!currentlyLive && isLiveNow) {
                isLiveNow = false;
                await sendDiscordMessage(`⚫ @${TARGET_USERNAME} has ended their Instagram Live stream.`);
            }
            
        } catch (error) {
            console.error('Error in monitoring loop:', error);
        }
    }, 60 * 1000); // Check every minute
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    if (browser) {
        await browser.close();
    }
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    if (browser) {
        await browser.close();
    }
    await client.destroy();
    process.exit(0);
});

// Start the bot
client.login(DISCORD_TOKEN);