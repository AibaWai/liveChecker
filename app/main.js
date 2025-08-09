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
let sessionData = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    cookies: null,
    xigappid: null,
    xcsrftoken: null
};

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
    
    // Initialize session data
    sessionData.cookies = `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}; mid=ZnH2YAAEAAFONwllOTI_7qW3kJMY; ig_cb=2; rur="CLN\\05462966\\0541759885160:01f75e646da28254a58b85c3a0b17e49dd5b2b73b5e4aee0d08a6a50fe1b0cd5c5b6b10e"`;
    sessionData.xcsrftoken = IG_CSRF_TOKEN;
    
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

// Enhanced HTTP request function
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = [];
            
            // Collect Set-Cookie headers for session management
            const setCookies = res.headers['set-cookie'];
            if (setCookies) {
                console.log('📧 Received new cookies from server');
                // Update session cookies if needed
            }
            
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                console.log(`↪️ Redirect ${res.statusCode} to ${res.headers.location}`);
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: '',
                    redirectLocation: res.headers.location
                });
                return;
            }
            
            res.on('data', (chunk) => data.push(chunk));
            
            res.on('end', () => {
                let buffer = Buffer.concat(data);
                let finalData = '';
                
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
                    console.log('❌ Decompression failed, using raw content');
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

// Step 1: Initialize Instagram session (like opening instagram.com)
async function initializeSession() {
    try {
        console.log('🔄 Step 1: Initializing Instagram session...');
        
        const response = await makeRequest('https://www.instagram.com/', {
            method: 'GET',
            headers: {
                'User-Agent': sessionData.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'Connection': 'keep-alive'
            }
        });
        
        if (response.statusCode === 200) {
            console.log('✅ Instagram homepage loaded successfully');
            
            // Extract X-IG-App-ID from the homepage if available
            const appIdMatch = response.data.match(/"APP_ID":"(\d+)"/);
            if (appIdMatch) {
                sessionData.xigappid = appIdMatch[1];
                console.log(`📱 Found X-IG-App-ID: ${sessionData.xigappid}`);
            }
            
            return true;
        } else {
            console.log(`❌ Failed to load Instagram homepage: ${response.statusCode}`);
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error initializing session:', error);
        return false;
    }
}

// Step 2: Navigate to profile with session cookies
async function getProfileWithSession() {
    try {
        console.log(`🔄 Step 2: Loading profile @${TARGET_USERNAME} with full session...`);
        
        // First, try the web_profile_info API (this often contains live data)
        const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${TARGET_USERNAME}`;
        
        console.log('📡 Trying Instagram API endpoint...');
        const apiResponse = await makeRequest(apiUrl, {
            method: 'GET',
            headers: {
                'User-Agent': sessionData.userAgent,
                'Accept': '*/*',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'X-CSRFToken': sessionData.xcsrftoken,
                'X-IG-App-ID': sessionData.xigappid || '936619743392459',
                'X-Instagram-AJAX': '1',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': sessionData.cookies,
                'Referer': `https://www.instagram.com/${TARGET_USERNAME}/`,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            }
        });
        
        if (apiResponse.statusCode === 200) {
            console.log('✅ API endpoint successful!');
            console.log(`📊 API response length: ${apiResponse.data.length} chars`);
            
            try {
                const apiData = JSON.parse(apiResponse.data);
                console.log('📦 API data parsed successfully');
                
                // Check for live status in API response
                const liveStatus = checkAPIForLiveStatus(apiData);
                if (liveStatus !== null) {
                    return { isLive: liveStatus, source: 'API' };
                }
                
            } catch (e) {
                console.log('❌ Failed to parse API response as JSON');
            }
        } else {
            console.log(`❌ API endpoint failed: ${apiResponse.statusCode}`);
        }
        
        // Fallback to regular profile page
        console.log('🔄 Falling back to regular profile page...');
        
        const profileUrl = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const profileResponse = await makeRequest(profileUrl, {
            method: 'GET',
            headers: {
                'User-Agent': sessionData.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cookie': sessionData.cookies,
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'Referer': 'https://www.instagram.com/'
            }
        });
        
        if (profileResponse.statusCode === 200) {
            console.log('✅ Profile page loaded');
            console.log(`📊 Profile HTML length: ${profileResponse.data.length} chars`);
            
            // Check for live status in HTML
            const htmlLiveStatus = checkHTMLForLiveStatus(profileResponse.data);
            return { isLive: htmlLiveStatus, source: 'HTML' };
        } else {
            console.log(`❌ Profile page failed: ${profileResponse.statusCode}`);
            return { isLive: false, source: 'Error' };
        }
        
    } catch (error) {
        console.error('❌ Error getting profile:', error);
        return { isLive: false, source: 'Error' };
    }
}

// Check API response for live status
function checkAPIForLiveStatus(apiData) {
    console.log('🔍 Checking API data for live status...');
    
    try {
        const user = apiData.data?.user;
        if (!user) {
            console.log('❌ No user data in API response');
            return null;
        }
        
        console.log(`👤 User found: ${user.username}`);
        console.log(`📊 User data keys: ${Object.keys(user).join(', ')}`);
        
        // Check direct live indicators
        if (user.is_live === true) {
            console.log('🔴 LIVE DETECTED: is_live = true');
            return true;
        }
        
        if (user.broadcast && user.broadcast.broadcast_status === 'active') {
            console.log('🔴 LIVE DETECTED: broadcast_status = active');
            return true;
        }
        
        // Check for live broadcast ID
        if (user.live_broadcast_id || user.broadcast_id) {
            console.log('🔴 LIVE DETECTED: has broadcast ID');
            return true;
        }
        
        // Check in edge data
        if (user.edge_owner_to_timeline_media?.edges) {
            for (const edge of user.edge_owner_to_timeline_media.edges) {
                if (edge.node?.media_type === 4) { // Media type 4 is live video
                    console.log('🔴 LIVE DETECTED: media_type = 4');
                    return true;
                }
            }
        }
        
        console.log('⚫ No live indicators found in API data');
        return false;
        
    } catch (error) {
        console.error('❌ Error checking API data:', error);
        return null;
    }
}

// Check HTML for live status with enhanced detection
function checkHTMLForLiveStatus(html) {
    console.log('🔍 Checking HTML for live status...');
    
    // Method 1: Check for window._sharedData
    const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});/s);
    if (sharedDataMatch) {
        try {
            console.log('📦 Found window._sharedData, parsing...');
            const sharedData = JSON.parse(sharedDataMatch[1]);
            
            const profilePage = sharedData?.entry_data?.ProfilePage?.[0];
            const user = profilePage?.graphql?.user;
            
            if (user) {
                if (user.is_live === true) {
                    console.log('🔴 LIVE DETECTED in _sharedData: is_live = true');
                    return true;
                }
                
                if (user.broadcast && user.broadcast.broadcast_status === 'active') {
                    console.log('🔴 LIVE DETECTED in _sharedData: broadcast active');
                    return true;
                }
            }
        } catch (e) {
            console.log('❌ Failed to parse _sharedData:', e.message);
        }
    }
    
    // Method 2: Look for specific live badge text
    const liveTexts = ['直播', 'LIVE', 'En vivo', 'Live'];
    
    for (const liveText of liveTexts) {
        const regex = new RegExp(`<span[^>]*>${liveText}</span>`, 'gi');
        const matches = html.match(regex);
        
        if (matches) {
            console.log(`🔴 LIVE DETECTED: Found ${liveText} in span tag`);
            console.log(`   Matches: ${matches.length}`);
            console.log(`   First match: ${matches[0]}`);
            return true;
        }
    }
    
    // Method 3: Look for live badge with border styling
    const liveBadgeRegex = /<span[^>]*style="[^"]*border[^"]*"[^>]*>(直播|LIVE)<\/span>/gi;
    const badgeMatches = html.match(liveBadgeRegex);
    
    if (badgeMatches) {
        console.log('🔴 LIVE DETECTED: Found styled live badge');
        console.log(`   Badge: ${badgeMatches[0]}`);
        return true;
    }
    
    console.log('⚫ No live indicators found in HTML');
    return false;
}

// Main live checking function
async function checkLiveStatus() {
    try {
        console.log(`\n🔍 === Checking @${TARGET_USERNAME} live status ===`);
        
        // Step 1: Initialize session
        const sessionInitialized = await initializeSession();
        if (!sessionInitialized) {
            console.log('❌ Failed to initialize session');
            return false;
        }
        
        // Step 2: Wait a moment (simulate human browsing)
        console.log('⏳ Waiting 2 seconds (simulate human browsing)...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Step 3: Get profile with full session
        const result = await getProfileWithSession();
        
        console.log(`📊 Result: ${result.isLive ? '🔴 LIVE' : '⚫ Offline'} (via ${result.source})`);
        return result.isLive;
        
    } catch (error) {
        console.error('❌ Error in checkLiveStatus:', error);
        return false;
    }
}

// Simple login verification
async function verifyInstagramLogin() {
    try {
        console.log('🔍 Verifying Instagram login...');
        return await initializeSession();
    } catch (error) {
        console.error('❌ Error verifying login:', error);
        return false;
    }
}

// Main monitoring loop
async function startMonitoring() {
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Browser Simulation v2)`);
    
    // Verify login first
    const loginValid = await verifyInstagramLogin();
    
    if (!loginValid) {
        const errorMsg = '❌ Instagram session initialization failed!';
        console.error(errorMsg);
        await sendDiscordMessage(errorMsg);
        console.log('🛑 Stopping service due to initialization failure...');
        process.exit(1);
    }
    
    console.log('✅ Instagram session verified!');
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Browser Sim v2) ✅\n\n⚡ 使用真實瀏覽器會話檢測`);
    
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
    }, 60 * 1000); // Check every 1 minute
    
    // Heartbeat every 10 minutes
    setInterval(() => {
        console.log(`💓 Browser simulation active - @${TARGET_USERNAME} | ${isLiveNow ? '🔴 LIVE' : '⚫ Offline'} | ${new Date().toLocaleString('zh-TW')}`);
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