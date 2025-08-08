const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');
const zlib = require('zlib');

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
let userId = '71878062223'; // We already know this from previous log

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

// Make HTTP request with proper error handling and decompression
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = [];
            
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                console.log(`Redirect detected: ${res.statusCode} to ${res.headers.location}`);
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: '',
                    redirectLocation: res.headers.location
                });
                return;
            }
            
            // Collect data as Buffer chunks
            res.on('data', (chunk) => data.push(chunk));
            
            res.on('end', () => {
                let buffer = Buffer.concat(data);
                let finalData = '';
                
                // Handle different encodings
                const encoding = res.headers['content-encoding'];
                
                try {
                    if (encoding === 'gzip') {
                        finalData = zlib.gunzipSync(buffer).toString('utf8');
                    } else if (encoding === 'deflate') {
                        finalData = zlib.inflateSync(buffer).toString('utf8');
                    } else if (encoding === 'br') {
                        finalData = zlib.brotliDecompressSync(buffer).toString('utf8');
                    } else {
                        finalData = buffer.toString('utf8');
                    }
                } catch (decompressError) {
                    console.log('❌ Decompression failed, using raw content:', decompressError.message);
                    finalData = buffer.toString('utf8');
                }
                
                resolve({ 
                    statusCode: res.statusCode, 
                    headers: res.headers, 
                    data: finalData 
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

// Get Instagram API headers
function getInstagramAPIHeaders() {
    return {
        'User-Agent': 'Instagram 219.0.0.12.117 Android (29/10; 480dpi; 1080x2220; samsung; SM-G973F; beyond1; exynos9820; en_US; 329095854)',
        'Accept': '*/*',
        'Accept-Language': 'en-US',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'X-IG-App-ID': '936619743392459',
        'X-Instagram-AJAX': '1',
        'X-CSRFToken': IG_CSRF_TOKEN,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`,
        'Referer': 'https://www.instagram.com/',
        'Origin': 'https://www.instagram.com'
    };
}

// Check stories for live broadcasts (this is where lives usually appear)
async function checkStoriesForLive() {
    try {
        console.log('🔎 Method 1: Checking Stories API for live broadcasts...');
        
        // Stories API endpoint
        const storiesUrl = `https://www.instagram.com/api/v1/feed/user/${userId}/story/`;
        const response = await makeRequest(storiesUrl, {
            method: 'GET',
            headers: getInstagramAPIHeaders()
        });
        
        if (response.statusCode === 200) {
            try {
                const data = JSON.parse(response.data);
                console.log(`📦 Stories API response: ${JSON.stringify(data).substring(0, 300)}...`);
                
                // Check if there are any items in stories
                if (data.items && Array.isArray(data.items)) {
                    console.log(`📊 Found ${data.items.length} story items`);
                    
                    for (const item of data.items) {
                        // Look for live broadcast indicators
                        if (item.media_type === 4 || // Media type 4 is typically live video
                            item.broadcast_id ||
                            (item.video_versions && item.live_broadcast_id)) {
                            console.log('🔴 LIVE STORY DETECTED!');
                            console.log(`📋 Live item: ${JSON.stringify(item, null, 2)}`);
                            return true;
                        }
                        
                        // Also check for any mention of live in the item
                        const itemStr = JSON.stringify(item);
                        if (itemStr.includes('broadcast') || itemStr.includes('live')) {
                            console.log(`🔍 Found broadcast/live reference in story: ${itemStr.substring(0, 200)}`);
                            if (itemStr.includes('"broadcast_status":"active"') || 
                                itemStr.includes('"is_live":true')) {
                                console.log('🔴 LIVE DETECTED in story metadata!');
                                return true;
                            }
                        }
                    }
                } else {
                    console.log('📊 No story items found');
                }
                
            } catch (e) {
                console.log('❌ Failed to parse stories API response:', e.message);
            }
        } else {
            console.log(`❌ Stories API returned ${response.statusCode}`);
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Error checking stories:', error.message);
        return false;
    }
}

// Check feed timeline for live broadcasts
async function checkTimelineForLive() {
    try {
        console.log('🔎 Method 2: Checking Timeline/Feed for live broadcasts...');
        
        // Timeline API might show live broadcasts
        const timelineUrl = 'https://www.instagram.com/api/v1/feed/timeline/';
        const response = await makeRequest(timelineUrl, {
            method: 'GET',
            headers: getInstagramAPIHeaders()
        });
        
        if (response.statusCode === 200) {
            try {
                const data = JSON.parse(response.data);
                const jsonStr = JSON.stringify(data);
                
                // Look for our target username in live broadcasts
                if (jsonStr.includes(TARGET_USERNAME) && 
                    (jsonStr.includes('broadcast') || jsonStr.includes('live'))) {
                    console.log(`🔍 Found ${TARGET_USERNAME} with broadcast/live in timeline`);
                    
                    if (jsonStr.includes('"broadcast_status":"active"') ||
                        jsonStr.includes('"is_live":true') ||
                        jsonStr.includes('"media_type":4')) {
                        console.log('🔴 LIVE DETECTED in timeline!');
                        return true;
                    }
                }
                
            } catch (e) {
                console.log('❌ Failed to parse timeline response:', e.message);
            }
        } else {
            console.log(`❌ Timeline API returned ${response.statusCode}`);
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Error checking timeline:', error.message);
        return false;
    }
}

// Alternative method: Check profile with different headers
async function checkProfileWithMobileHeaders() {
    try {
        console.log('🔎 Method 3: Checking profile with mobile headers...');
        
        const mobileHeaders = {
            'User-Agent': 'Instagram 219.0.0.12.117 Android (29/10; 480dpi; 1080x2220; samsung; SM-G973F; beyond1; exynos9820; en_US; 329095854)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`,
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        };
        
        const profileUrl = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const response = await makeRequest(profileUrl, {
            method: 'GET',
            headers: mobileHeaders
        });
        
        if (response.statusCode === 200) {
            const html = response.data;
            console.log(`📊 Mobile HTML length: ${html.length} characters`);
            
            // Look for live indicators in mobile version
            const livePatterns = [
                /直播/g,
                /LIVE/g,
                /"is_live"\s*:\s*true/g,
                /"broadcast_status"\s*:\s*"active"/g,
                /"media_type"\s*:\s*4/g
            ];
            
            for (const pattern of livePatterns) {
                const matches = html.match(pattern);
                if (matches) {
                    console.log(`🔍 Found ${matches.length} matches for pattern: ${pattern}`);
                    
                    // Show context for first few matches
                    for (let i = 0; i < Math.min(matches.length, 3); i++) {
                        const match = matches[i];
                        const index = html.indexOf(match);
                        const context = html.substring(Math.max(0, index - 100), index + 100);
                        console.log(`   Match ${i + 1}: "${context.replace(/\s+/g, ' ')}"`);
                        
                        // Check if this is a real live indicator (not CSS)
                        if (!context.includes('--ig-') && !context.includes('css') && 
                            (match === '直播' || match === 'LIVE' || context.includes('true'))) {
                            console.log('🔴 LIVE DETECTED in mobile profile!');
                            return true;
                        }
                    }
                }
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Error checking mobile profile:', error.message);
        return false;
    }
}

// Main live status check combining all methods
async function checkLiveStatus() {
    try {
        console.log(`🔍 Checking if @${TARGET_USERNAME} is live...`);
        
        // Method 1: Check stories API
        const storiesLive = await checkStoriesForLive();
        if (storiesLive) return true;
        
        // Method 2: Check timeline/feed
        const timelineLive = await checkTimelineForLive();
        if (timelineLive) return true;
        
        // Method 3: Check profile with mobile headers
        const mobileLive = await checkProfileWithMobileHeaders();
        if (mobileLive) return true;
        
        console.log('⚫ No live indicators found through any method');
        return false;
        
    } catch (error) {
        console.error('❌ Error in checkLiveStatus:', error);
        return false;
    }
}

// Simple login verification
async function verifyInstagramLogin() {
    try {
        console.log('🔍 Verifying Instagram login...');
        
        // Quick check if we can access profile
        const profileUrl = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const response = await makeRequest(profileUrl, {
            method: 'GET',
            headers: getInstagramAPIHeaders()
        });
        
        if (response.statusCode === 200 && !response.data.includes('Log in')) {
            console.log('✅ Instagram login verified');
            return true;
        } else {
            console.log('❌ Instagram login failed');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error verifying login:', error);
        return false;
    }
}

// Main monitoring loop
async function startMonitoring() {
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Stories API Method)`);
    
    // Verify login first
    const loginValid = await verifyInstagramLogin();
    
    if (!loginValid) {
        const errorMsg = '❌ Instagram login failed! Please update your cookies and restart.';
        console.error(errorMsg);
        await sendDiscordMessage(errorMsg);
        console.log('🛑 Stopping service due to authentication failure...');
        process.exit(1);
    }
    
    console.log('✅ Instagram login verified!');
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Stories API) ✅`);
    
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
    
    // Monitor every 30 seconds for faster detection
    console.log('⏰ Starting monitoring loop (every 30 seconds)...');
    setInterval(async () => {        
        try {
            const currentlyLive = await checkLiveStatus();
            
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
        }
    }, 30 * 1000); // Check every 30 seconds
    
    // Heartbeat every 10 minutes
    setInterval(() => {
        console.log(`💓 Monitor active - @${TARGET_USERNAME} | ${isLiveNow ? '🔴 LIVE' : '⚫ Offline'} | ${new Date().toLocaleString('zh-TW')}`);
    }, 10 * 60 * 1000);
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