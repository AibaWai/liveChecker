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
let userId = null;

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
        'User-Agent': 'Instagram 219.0.0.12.117 Android',
        'Accept': '*/*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'X-IG-App-ID': '936619743392459',
        'X-Instagram-AJAX': '1',
        'X-CSRFToken': IG_CSRF_TOKEN,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`
    };
}

// Get web headers for profile page
function getWebHeaders() {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-CH-UA': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
        'Cache-Control': 'max-age=0',
        'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}; mid=ZnH2YAAEAAFONwllOTI_7qW3kJMY`
    };
}

// Get user ID from username
async function getUserId() {
    if (userId) return userId;
    
    try {
        console.log(`🔍 Getting user ID for @${TARGET_USERNAME}...`);
        
        // Try to get user ID from profile page
        const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${TARGET_USERNAME}`;
        const response = await makeRequest(url, {
            method: 'GET',
            headers: getInstagramAPIHeaders()
        });
        
        if (response.statusCode === 200) {
            try {
                const data = JSON.parse(response.data);
                if (data.data && data.data.user && data.data.user.id) {
                    userId = data.data.user.id;
                    console.log(`✅ Found user ID: ${userId}`);
                    return userId;
                }
            } catch (e) {
                console.log('❌ Failed to parse user profile API response');
            }
        }
        
        // Fallback: try to extract from HTML
        const profileUrl = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const profileResponse = await makeRequest(profileUrl, {
            method: 'GET',
            headers: getWebHeaders()
        });
        
        if (profileResponse.statusCode === 200) {
            const html = profileResponse.data;
            
            // Try to find user ID in various places
            const userIdPatterns = [
                /"profile_id":"(\d+)"/,
                /"id":"(\d+)"/,
                /"owner":{"id":"(\d+)"/,
                /"profilePage_\d+".*?"user":{"id":"(\d+)"/
            ];
            
            for (const pattern of userIdPatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    userId = match[1];
                    console.log(`✅ Extracted user ID from HTML: ${userId}`);
                    return userId;
                }
            }
        }
        
        console.log('❌ Could not find user ID');
        return null;
        
    } catch (error) {
        console.error('❌ Error getting user ID:', error);
        return null;
    }
}

// Check live status using multiple methods
async function checkLiveStatus() {
    try {
        console.log(`🔍 Checking if @${TARGET_USERNAME} is live...`);
        
        // Method 1: Try Instagram API approach
        const currentUserId = await getUserId();
        if (currentUserId) {
            console.log('🔎 Method 1: Checking via Instagram API...');
            
            // Try to get live broadcast info
            const apiEndpoints = [
                `https://www.instagram.com/api/v1/live/${currentUserId}/info/`,
                `https://www.instagram.com/api/v1/users/${currentUserId}/info/`,
                `https://i.instagram.com/api/v1/users/${currentUserId}/info/`
            ];
            
            for (const endpoint of apiEndpoints) {
                try {
                    const response = await makeRequest(endpoint, {
                        method: 'GET',
                        headers: getInstagramAPIHeaders()
                    });
                    
                    if (response.statusCode === 200) {
                        console.log(`📊 API Response from ${endpoint}: ${response.data.substring(0, 200)}...`);
                        
                        const data = JSON.parse(response.data);
                        
                        // Check for live indicators in API response
                        const liveIndicators = [
                            'is_live',
                            'broadcast_status',
                            'live_broadcast',
                            'broadcast_id'
                        ];
                        
                        const jsonStr = JSON.stringify(data);
                        for (const indicator of liveIndicators) {
                            if (jsonStr.includes(indicator)) {
                                console.log(`🔍 Found live indicator in API: ${indicator}`);
                                
                                if (jsonStr.includes('"is_live":true') || 
                                    jsonStr.includes('"broadcast_status":"active"')) {
                                    console.log('🔴 LIVE detected via API!');
                                    return true;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.log(`❌ API call failed for ${endpoint}: ${e.message}`);
                }
            }
        }
        
        // Method 2: Enhanced HTML parsing with JavaScript simulation
        console.log('🔎 Method 2: Enhanced HTML parsing...');
        
        const profileUrl = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const response = await makeRequest(profileUrl, {
            method: 'GET',
            headers: {
                ...getWebHeaders(),
                // Try to simulate a real browser more closely
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        
        if (response.statusCode === 200) {
            const html = response.data;
            console.log(`📊 HTML length: ${html.length} characters`);
            
            // Look for embedded JSON data that might contain live status
            console.log('🔍 Searching for embedded JSON with live data...');
            
            // Pattern 1: Look for window._sharedData
            const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});/s);
            if (sharedDataMatch) {
                try {
                    const sharedData = JSON.parse(sharedDataMatch[1]);
                    console.log('📦 Found _sharedData');
                    
                    const jsonStr = JSON.stringify(sharedData);
                    
                    if (jsonStr.includes('"is_live":true') ||
                        jsonStr.includes('"broadcast_status":"active"') ||
                        jsonStr.includes('"__typename":"GraphLiveVideo"')) {
                        console.log('🔴 LIVE detected in _sharedData!');
                        return true;
                    }
                } catch (e) {
                    console.log('❌ Failed to parse _sharedData');
                }
            }
            
            // Pattern 2: Look for JSON in script tags
            const scriptMatches = html.match(/<script[^>]*>.*?({.*?"is_live".*?}.*?)<\/script>/gs);
            if (scriptMatches) {
                console.log(`📦 Found ${scriptMatches.length} scripts with is_live`);
                
                for (const script of scriptMatches.slice(0, 3)) {
                    if (script.includes('"is_live":true')) {
                        console.log('🔴 LIVE detected in script tag!');
                        return true;
                    }
                }
            }
            
            // Pattern 3: Look for live badge in any language
            const liveBadgePatterns = [
                /直播/g,
                /LIVE/g,
                /live/g,
                /En vivo/g,
                /Live/g,
                /在線/g,
                /ライブ/g
            ];
            
            for (const pattern of liveBadgePatterns) {
                const matches = html.match(pattern);
                if (matches) {
                    // Filter out CSS and script false positives
                    const validMatches = matches.filter(match => {
                        const context = html.substring(
                            html.indexOf(match) - 50,
                            html.indexOf(match) + 50
                        );
                        return !context.includes('--ig-live') && 
                               !context.includes('css') &&
                               !context.includes('script') &&
                               context.includes('<');
                    });
                    
                    if (validMatches.length > 0) {
                        console.log(`🔴 LIVE detected via badge: ${validMatches[0]}`);
                        return true;
                    }
                }
            }
        }
        
        console.log('⚫ No live indicators found');
        return false;
        
    } catch (error) {
        console.error('❌ Error checking live status:', error);
        return false;
    }
}

// Verify login
async function verifyInstagramLogin() {
    try {
        console.log('🔍 Verifying Instagram login...');
        
        const userId = await getUserId();
        if (userId) {
            console.log('✅ Instagram login verified - got user ID');
            return true;
        } else {
            console.log('❌ Could not verify login - no user ID');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error verifying login:', error);
        return false;
    }
}

// Main monitoring loop
async function startMonitoring() {
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME}`);
    
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
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (API Method) ✅`);
    
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
    
    // Monitor every 1 minute
    console.log('⏰ Starting monitoring loop (every 1 minute)...');
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
    }, 60 * 1000); // Check every 1 minute
    
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