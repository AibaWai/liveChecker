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
                        console.log('📦 Decompressing gzip content...');
                        finalData = zlib.gunzipSync(buffer).toString('utf8');
                    } else if (encoding === 'deflate') {
                        console.log('📦 Decompressing deflate content...');
                        finalData = zlib.inflateSync(buffer).toString('utf8');
                    } else if (encoding === 'br') {
                        console.log('📦 Decompressing brotli content...');
                        finalData = zlib.brotliDecompressSync(buffer).toString('utf8');
                    } else {
                        console.log('📦 No compression detected, using raw content...');
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

// Get Instagram headers with cookies
function getInstagramHeaders() {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
        'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}; rur="CLN\\05462966\\0541759885160:01f75e646da28254a58b85c3a0b17e49dd5b2b73b5e4aee0d08a6a50fe1b0cd5c5b6b10e"`
    };
}

// Verify Instagram login
async function verifyInstagramLogin() {
    try {
        console.log('🔍 Verifying Instagram login...');
        
        const url = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const response = await makeRequest(url, {
            method: 'GET',
            headers: getInstagramHeaders()
        });
        
        console.log(`📊 Response status: ${response.statusCode}`);
        
        // Handle redirects (likely means cookies expired)
        if (response.statusCode === 301 || response.statusCode === 302) {
            console.log(`❌ Redirect detected to: ${response.redirectLocation}`);
            if (response.redirectLocation && response.redirectLocation.includes('accounts/login')) {
                console.log('🚨 Redirected to login page - cookies expired!');
                return false;
            }
        }
        
        if (response.statusCode !== 200) {
            console.log(`❌ Unexpected status code: ${response.statusCode}`);
            return false;
        }
        
        const html = response.data;
        
        // Check if we got actual profile content
        if (html.includes('accounts/login') || html.includes('Log in to Instagram')) {
            console.log('❌ Received login page despite using cookies');
            return false;
        }
        
        console.log('✅ Successfully accessed Instagram profile page');
        
        // Enhanced login verification
        const loginIndicators = [
            html.includes('Log in'),
            html.includes('Sign up'),
            html.includes('Create account'),
            html.includes('login_form'),
            html.includes('loginForm'),
            html.includes('"require_login":true'),
        ];
        
        const isLoggedIn = !loginIndicators.some(indicator => indicator);
        
        // Check for authenticated user elements
        const userElements = [
            html.includes('direct_v2'),
            html.includes('notifications'),
            html.includes('activity_feed'),
            html.includes('profileMenu'),
            html.includes('"viewer"'),
            html.includes('logged_in_user'),
        ];
        
        const hasUserElements = userElements.some(element => element);
        
        console.log(`📊 Login status: ${isLoggedIn ? '✅ Logged in' : '❌ Not logged in'}`);
        console.log(`📊 User elements: ${hasUserElements ? '✅ Found' : '❌ Missing'}`);
        
        return isLoggedIn && hasUserElements;
        
    } catch (error) {
        console.error('❌ Error verifying login:', error);
        return false;
    }
}

// Comprehensive live status check
async function checkLiveStatus() {
    try {
        console.log('🔍 Checking Instagram live status...');
        
        const url = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const response = await makeRequest(url, {
            method: 'GET',
            headers: getInstagramHeaders()
        });
        
        if (response.statusCode !== 200) {
            console.log(`❌ Unexpected status code: ${response.statusCode}`);
            return false;
        }
        
        const html = response.data;
        
        // Method 1: Check window._sharedData
        console.log('🔎 Method 1: Checking window._sharedData...');
        const sharedDataMatches = html.match(/window\._sharedData\s*=\s*({.*?});/s);
        if (sharedDataMatches) {
            try {
                const sharedData = JSON.parse(sharedDataMatches[1]);
                const profilePage = sharedData?.entry_data?.ProfilePage?.[0];
                const user = profilePage?.graphql?.user;
                
                if (user) {
                    if (user.broadcast && user.broadcast.broadcast_status === 'active') {
                        console.log('🔴 LIVE detected via _sharedData broadcast!');
                        return true;
                    }
                    
                    if (user.is_live === true) {
                        console.log('🔴 LIVE detected via _sharedData is_live!');
                        return true;
                    }
                }
            } catch (e) {
                console.log('❌ Failed to parse _sharedData:', e.message);
            }
        }
        
        // Method 2: Check JSON script tags
        console.log('🔎 Method 2: Checking JSON script tags...');
        const jsonScriptRegex = /<script type="application\/json"[^>]*>([^<]*)<\/script>/g;
        let jsonScriptMatch;
        let scriptCount = 0;
        
        while ((jsonScriptMatch = jsonScriptRegex.exec(html)) !== null && scriptCount < 10) {
            scriptCount++;
            try {
                const jsonContent = JSON.parse(jsonScriptMatch[1]);
                const jsonString = JSON.stringify(jsonContent);
                
                const liveJsonPatterns = [
                    'broadcast_status":"active"',
                    '"is_live":true',
                    '"__typename":"GraphLiveVideo"',
                    'GraphLiveVideo',
                    '"media_type":4'
                ];
                
                for (const pattern of liveJsonPatterns) {
                    if (jsonString.includes(pattern)) {
                        console.log(`🔴 LIVE detected in JSON script ${scriptCount}: ${pattern}`);
                        return true;
                    }
                }
                
            } catch (e) {
                // Skip invalid JSON
            }
        }
        
        // Method 3: Search for live badge HTML
        console.log('🔎 Method 3: Checking for live badge...');
        
        const liveBadgePatterns = [
            /直播/i,
            /<span[^>]*>LIVE<\/span>/i,
            /<div[^>]*live[^>]*>/i,
            /style="[^"]*border:\s*2px\s+solid[^"]*"[^>]*>(?:直播|LIVE)<\/span>/i
        ];
        
        for (const pattern of liveBadgePatterns) {
            if (html.match(pattern)) {
                console.log(`🔴 LIVE detected via badge pattern!`);
                return true;
            }
        }
        
        // Method 4: Check page title
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1] : '';
        
        if (pageTitle.toLowerCase().includes('live')) {
            console.log('🔴 LIVE detected in page title!');
            return true;
        }
        
        console.log('❌ No live indicators found');
        return false;
        
    } catch (error) {
        console.error('❌ Error checking live status:', error);
        return false;
    }
}

// Main monitoring loop
async function startMonitoring() {
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME}`);
    
    // Verify login first
    console.log('🔎 Verifying Instagram login credentials...');
    const loginValid = await verifyInstagramLogin();
    
    if (!loginValid) {
        const errorMsg = '❌ Instagram login failed! Please update your cookies (IG_SESSION_ID, IG_CSRF_TOKEN, IG_DS_USER_ID) and restart the service.';
        console.error(errorMsg);
        
        try {
            await sendDiscordMessage(errorMsg);
        } catch (discordError) {
            console.error('Failed to send Discord error message:', discordError);
        }
        
        console.log('🛑 Stopping service due to authentication failure...');
        process.exit(1);
    }
    
    console.log('✅ Instagram login verified successfully!');
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} - Login verified ✅`);
    
    // Initial live status check
    console.log('🔎 Performing initial live status check...');
    try {
        const initialStatus = await checkLiveStatus();
        isLiveNow = initialStatus;
        if (initialStatus) {
            await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is currently LIVE on Instagram! https://www.instagram.com/${TARGET_USERNAME}/`);
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
            console.log('\n🔄 --- Starting new check cycle ---');
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
            } else {
                console.log(`📊 Status unchanged: ${currentlyLive ? '🔴 LIVE' : '⚫ Offline'}`);
            }
            
            console.log('🔄 --- Check cycle complete ---\n');
            
        } catch (error) {
            console.error('❌ Error in monitoring loop:', error);
        }
    }, 2 * 60 * 1000);
    
    // Keep alive heartbeat
    setInterval(() => {
        console.log(`💓 Bot heartbeat - monitoring @${TARGET_USERNAME} | Live: ${isLiveNow ? '🔴' : '⚫'} | ${new Date().toISOString()}`);
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