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

// Enhanced request with session persistence and JavaScript simulation
async function makeEnhancedRequest(url) {
    console.log(`🔍 Making enhanced request to: ${url}`);
    
    // Enhanced headers to better simulate a real browser
    const enhancedHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}; rur="CLN\\05462966\\0541759885160:01f75e646da28254a58b85c3a0b17e49dd5b2b73b5e4aee0d08a6a50fe1b0cd5c5b6b10e"`,
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Connection': 'keep-alive'
    };
    
    const response = await makeRequest(url, {
        method: 'GET',
        headers: enhancedHeaders
    });
    
    if (response.statusCode !== 200) {
        console.log(`❌ Enhanced request failed: HTTP ${response.statusCode}`);
        return null;
    }
    
    return response.data;
}

// Try alternative Instagram endpoints
async function checkAlternativeEndpoints() {
    console.log('🔍 Trying alternative Instagram endpoints...');
    
    const endpoints = [
        // Mobile web version (might have different content)
        `https://www.instagram.com/${TARGET_USERNAME}/?__a=1&__d=dis`,
        
        // Profile with specific parameters
        `https://www.instagram.com/${TARGET_USERNAME}/?hl=zh-tw`,
        
        // Mobile user agent specific
        `https://www.instagram.com/${TARGET_USERNAME}/`
    ];
    
    for (let i = 0; i < endpoints.length; i++) {
        const endpoint = endpoints[i];
        console.log(`🔎 Trying endpoint ${i + 1}: ${endpoint}`);
        
        try {
            let headers = {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`,
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            };
            
            // For mobile endpoints, use mobile user agent
            if (i === 2) {
                headers['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
            } else {
                headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            }
            
            const response = await makeRequest(endpoint, {
                method: 'GET',
                headers: headers
            });
            
            if (response.statusCode === 200) {
                const html = response.data;
                console.log(`📊 Endpoint ${i + 1} success: ${html.length} chars`);
                
                // Check if this endpoint has more content
                if (html.includes('window._sharedData') || 
                    html.includes('__d(') || 
                    html.includes('直播') ||
                    html.includes('<main') ||
                    html.includes('react-root')) {
                    
                    console.log(`✅ Endpoint ${i + 1} has dynamic content!`);
                    return { endpoint, html };
                } else {
                    console.log(`❌ Endpoint ${i + 1} also has static content`);
                }
            } else {
                console.log(`❌ Endpoint ${i + 1} failed: HTTP ${response.statusCode}`);
            }
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.log(`❌ Endpoint ${i + 1} error: ${error.message}`);
        }
    }
    
    return null;
}

// Try to make multiple requests with delays to simulate browser behavior
async function checkLiveWithBrowserSimulation() {
    try {
        console.log(`🔍 Checking @${TARGET_USERNAME} with browser simulation...`);
        
        // First, try alternative endpoints
        const altResult = await checkAlternativeEndpoints();
        if (altResult) {
            console.log(`🎯 Using alternative endpoint: ${altResult.endpoint}`);
            
            // Analyze the content from alternative endpoint
            return await analyzeLiveContent(altResult.html);
        }
        
        // If no alternative endpoints work, try multiple requests to main URL
        console.log('🔄 Trying multiple requests to main URL...');
        
        const url = `https://www.instagram.com/${TARGET_USERNAME}/`;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            console.log(`📡 Request attempt ${attempt}/3...`);
            
            const html = await makeEnhancedRequest(url);
            if (!html) continue;
            
            console.log(`📊 Attempt ${attempt}: ${html.length} characters`);
            
            // Check if we got better content
            const hasJsContent = html.includes('window._sharedData') || html.includes('__d(');
            const hasMainContent = html.includes('<main') || html.includes('react-root');
            
            console.log(`   JS Content: ${hasJsContent ? '✅' : '❌'}`);
            console.log(`   Main Content: ${hasMainContent ? '✅' : '❌'}`);
            
            if (hasJsContent || hasMainContent) {
                console.log(`✅ Attempt ${attempt} got dynamic content!`);
                return await analyzeLiveContent(html);
            }
            
            // Wait longer between attempts
            if (attempt < 3) {
                console.log(`⏳ Waiting 5 seconds before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        console.log('❌ All attempts failed to get dynamic content');
        return false;
        
    } catch (error) {
        console.error('❌ Error in browser simulation:', error);
        return false;
    }
}

// Analyze HTML content for live indicators
async function analyzeLiveContent(html) {
    console.log(`🔍 Analyzing content for live indicators...`);
    
    // Method 1: Look for JavaScript data
    if (html.includes('window._sharedData')) {
        console.log('📦 Found _sharedData, parsing...');
        
        const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});/s);
        if (sharedDataMatch) {
            try {
                const sharedData = JSON.parse(sharedDataMatch[1]);
                const jsonStr = JSON.stringify(sharedData);
                
                // Check for live indicators in JSON
                const liveIndicators = [
                    '"is_live":true',
                    '"broadcast_status":"active"',
                    '"media_type":4',
                    'GraphLiveVideo'
                ];
                
                for (const indicator of liveIndicators) {
                    if (jsonStr.includes(indicator)) {
                        console.log(`🔴 LIVE detected via JSON: ${indicator}`);
                        return true;
                    }
                }
                
            } catch (e) {
                console.log('❌ Failed to parse _sharedData');
            }
        }
    }
    
    // Method 2: Look for HTML live indicators
    const htmlLivePatterns = [
        /直播/g,
        /LIVE/g,
        /<span[^>]*>(?:直播|LIVE)<\/span>/gi,
        /<div[^>]*class="[^"]*live[^"]*"[^>]*>/gi
    ];
    
    for (const pattern of htmlLivePatterns) {
        const matches = html.match(pattern);
        if (matches) {
            // Filter out script/CSS false positives
            const validMatches = matches.filter(match => {
                const context = html.substring(
                    html.indexOf(match) - 100,
                    html.indexOf(match) + 100
                );
                return !context.includes('script') && 
                       !context.includes('--ig-live') && 
                       !context.includes('css');
            });
            
            if (validMatches.length > 0) {
                console.log(`🔴 LIVE detected via HTML: ${validMatches[0]}`);
                return true;
            }
        }
    }
    
    console.log('⚫ No live indicators found in content');
    return false;
}

// Simple login verification
async function verifyInstagramLogin() {
    try {
        console.log('🔍 Verifying Instagram login...');
        
        const html = await makeEnhancedRequest(`https://www.instagram.com/${TARGET_USERNAME}/`);
        
        if (html && html.includes(TARGET_USERNAME) && !html.includes('Log in')) {
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
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Browser Simulation)`);
    
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
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Browser Sim) ✅`);
    
    // Initial check
    console.log('🔎 Performing initial live status check...');
    try {
        const initialStatus = await checkLiveWithBrowserSimulation();
        isLiveNow = initialStatus;
        
        if (initialStatus) {
            await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is currently LIVE! 🎥\nhttps://www.instagram.com/${TARGET_USERNAME}/`);
        } else {
            console.log('✅ Initial check complete - not currently live');
        }
    } catch (error) {
        console.error('❌ Initial check failed:', error);
    }
    
    // Monitor every 2 minutes with browser simulation
    console.log('⏰ Starting monitoring loop (every 2 minutes)...');
    setInterval(async () => {        
        try {
            const currentlyLive = await checkLiveWithBrowserSimulation();
            
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
    }, 2 * 60 * 1000); // Check every 2 minutes
    
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