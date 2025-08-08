const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');

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

// Initialize Discord bot
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('Environment variables check:');
    console.log('- DISCORD_TOKEN:', DISCORD_TOKEN ? 'Set' : 'Missing');
    console.log('- DISCORD_CHANNEL_ID:', DISCORD_CHANNEL_ID || 'Missing');
    console.log('- TARGET_USERNAME:', TARGET_USERNAME || 'Missing');
    
    if (!TARGET_USERNAME || !DISCORD_CHANNEL_ID) {
        console.error('Missing required environment variables!');
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

// Make HTTP request
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({ 
                    statusCode: res.statusCode, 
                    headers: res.headers, 
                    data: data 
                });
            });
        });
        
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
    });
}

// Check live status by scraping public page
async function checkLiveStatus() {
    try {
        console.log('🔍 Checking Instagram page for live indicators...');
        
        const url = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const response = await makeRequest(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            }
        });
        
        if (response.statusCode !== 200) {
            console.log(`Instagram page returned status: ${response.statusCode}`);
            return false;
        }
        
        const html = response.data;
        
        // Check for various live indicators in HTML
        const liveIndicators = [
            'broadcast_status":"active"',
            '"is_live":true',
            '"broadcast_status":"active"',
            'ig-live-badge',
            'live-video-indicator',
            'LIVE</span>',
            'aria-label="Live"',
            'story_type":"live"',
            '"__typename":"GraphLiveVideo"'
        ];
        
        let foundIndicator = false;
        let detectionMethod = '';
        
        for (const indicator of liveIndicators) {
            if (html.includes(indicator)) {
                foundIndicator = true;
                detectionMethod = indicator;
                break;
            }
        }
        
        if (foundIndicator) {
            console.log(`✅ LIVE detected! Found indicator: "${detectionMethod}"`);
            return true;
        }
        
        // Additional check for shared data
        try {
            const sharedDataMatch = html.match(/window\._sharedData = ({.*?});/);
            if (sharedDataMatch) {
                const sharedData = JSON.parse(sharedDataMatch[1]);
                const user = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user;
                
                if (user && user.broadcast && user.broadcast.broadcast_status === 'active') {
                    console.log('✅ LIVE detected via shared data!');
                    return true;
                }
            }
        } catch (e) {
            console.log('Could not parse shared data, continuing...');
        }
        
        // Check for JSON data in script tags
        const scriptMatches = html.match(/<script type="application\/json"[^>]*>([^<]*)<\/script>/g);
        if (scriptMatches) {
            for (const scriptMatch of scriptMatches) {
                const jsonMatch = scriptMatch.match(/>([^<]*)</);
                if (jsonMatch) {
                    try {
                        const jsonData = JSON.parse(jsonMatch[1]);
                        const jsonString = JSON.stringify(jsonData);
                        
                        if (jsonString.includes('broadcast_status":"active"') || 
                            jsonString.includes('"is_live":true')) {
                            console.log('✅ LIVE detected in JSON script data!');
                            return true;
                        }
                    } catch (e) {
                        // Continue to next script
                    }
                }
            }
        }
        
        console.log('❌ No live stream detected');
        return false;
        
    } catch (error) {
        console.error('Error checking live status:', error);
        return false;
    }
}

// Main monitoring loop
async function startMonitoring() {
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Page Scraping Version)`);
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (No Cookies Required!)`);
    
    // Initial check
    console.log('Performing initial live status check...');
    try {
        const initialStatus = await checkLiveStatus();
        isLiveNow = initialStatus;
        if (initialStatus) {
            await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is currently LIVE on Instagram! https://www.instagram.com/${TARGET_USERNAME}/`);
        } else {
            console.log('✅ Initial check complete - not currently live');
        }
    } catch (error) {
        console.error('Initial check failed:', error);
    }
    
    // Monitor every minute
    console.log('⏰ Starting monitoring loop (every 60 seconds)...');
    setInterval(async () => {
        try {
            const currentlyLive = await checkLiveStatus();
            
            // Send notification when going live
            if (currentlyLive && !isLiveNow) {
                isLiveNow = true;
                await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is now LIVE on Instagram! 🎥\nhttps://www.instagram.com/${TARGET_USERNAME}/`);
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
    
    // Keep alive heartbeat
    setInterval(() => {
        console.log(`💓 Bot heartbeat - monitoring @${TARGET_USERNAME} | Status: ${isLiveNow ? '🔴 LIVE' : '⚫ Offline'}`);
    }, 10 * 60 * 1000); // Every 10 minutes
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await client.destroy();
    process.exit(0);
});

// Start the bot
client.login(DISCORD_TOKEN);