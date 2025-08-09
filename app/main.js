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

// Multiple strategies to get dynamic content
async function getDynamicInstagramContent() {
    const strategies = [
        {
            name: 'Desktop Chrome with XHR Headers',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}; mid=ZnH2YAAEAAFONwllOTI_7qW3kJMY; ig_cb=2; rur="CLN\\05462966\\0541759885160:01f75e646da28254a58b85c3a0b17e49dd5b2b73b5e4aee0d08a6a50fe1b0cd5c5b6b10e"`,
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'Connection': 'keep-alive',
                'DNT': '1'
            },
            url: `https://www.instagram.com/${TARGET_USERNAME}/`
        },
        
        {
            name: 'Mobile Safari',
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh-Hant;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`,
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            url: `https://www.instagram.com/${TARGET_USERNAME}/`
        },
        
        {
            name: 'Instagram Web API',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'zh-TW,zh;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'X-Instagram-AJAX': '1',
                'X-CSRFToken': IG_CSRF_TOKEN,
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`,
                'Referer': `https://www.instagram.com/${TARGET_USERNAME}/`,
                'Connection': 'keep-alive'
            },
            url: `https://www.instagram.com/api/v1/users/web_profile_info/?username=${TARGET_USERNAME}`
        },
        
        {
            name: 'Fresh Session Request',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`,
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            },
            url: `https://www.instagram.com/${TARGET_USERNAME}/?hl=zh-tw&variant=following`
        }
    ];
    
    for (const strategy of strategies) {
        try {
            console.log(`🔎 Trying: ${strategy.name}`);
            
            const response = await makeRequest(strategy.url, {
                method: 'GET',
                headers: strategy.headers
            });
            
            if (response.statusCode === 200) {
                const html = response.data;
                console.log(`📊 ${strategy.name}: ${html.length} chars, analyzing...`);
                
                // Check if this looks like dynamic content
                const hasDynamicMarkers = [
                    html.includes('window._sharedData'),
                    html.includes('__d('),
                    html.includes('require('),
                    html.includes('<main'),
                    html.includes('react-root'),
                    html.includes(TARGET_USERNAME.toLowerCase()),
                    html.length > 500000 // Large content suggests dynamic rendering
                ];
                
                const dynamicScore = hasDynamicMarkers.filter(Boolean).length;
                console.log(`   Dynamic score: ${dynamicScore}/7`);
                
                // If this looks like dynamic content, return it
                if (dynamicScore >= 3) {
                    console.log(`✅ ${strategy.name} returned dynamic content!`);
                    return { html, strategy: strategy.name };
                }
                
                // Even if it doesn't look dynamic, check for live content
                const hasLiveContent = checkForLiveContent(html);
                if (hasLiveContent !== null) {
                    console.log(`🎯 ${strategy.name} found live status: ${hasLiveContent}`);
                    return { html, strategy: strategy.name, forcedResult: hasLiveContent };
                }
                
            } else {
                console.log(`❌ ${strategy.name}: HTTP ${response.statusCode}`);
            }
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.log(`❌ ${strategy.name} failed: ${error.message}`);
        }
    }
    
    console.log('❌ All strategies failed to get dynamic content');
    return null;
}

// Focused live content detection
function checkForLiveContent(html) {
    console.log('🔍 Checking for live content...');
    
    // Method 1: Direct text search for "直播"
    const chineseLiveMatches = html.match(/直播/g);
    if (chineseLiveMatches) {
        console.log(`📊 Found ${chineseLiveMatches.length} occurrences of "直播"`);
        
        // Check context of each occurrence
        for (let i = 0; i < Math.min(chineseLiveMatches.length, 5); i++) {
            const index = html.indexOf('直播', i > 0 ? html.indexOf('直播') + 1 : 0);
            const context = html.substring(Math.max(0, index - 200), index + 200);
            
            console.log(`   Context ${i + 1}: "${context.replace(/\s+/g, ' ').substring(0, 150)}"`);
            
            // Check if this is in a meaningful context (not CSS or script)
            if (!context.includes('--ig-live') && 
                !context.includes('css') && 
                !context.includes('script') &&
                (context.includes('<span') || context.includes('<div'))) {
                
                console.log(`🔴 LIVE DETECTED: Real "直播" found in HTML context!`);
                return true;
            }
        }
    }
    
    // Method 2: Look for LIVE in English
    const englishLiveMatches = html.match(/\bLIVE\b/g);
    if (englishLiveMatches) {
        console.log(`📊 Found ${englishLiveMatches.length} occurrences of "LIVE"`);
        
        for (let i = 0; i < Math.min(englishLiveMatches.length, 3); i++) {
            const index = html.indexOf('LIVE', i > 0 ? html.indexOf('LIVE') + 1 : 0);
            const context = html.substring(Math.max(0, index - 200), index + 200);
            
            if (!context.includes('--ig-live') && 
                !context.includes('css') && 
                !context.includes('VideoPlayerWithLive') &&
                (context.includes('<span') || context.includes('<div'))) {
                
                console.log(`🔴 LIVE DETECTED: Real "LIVE" found in HTML context!`);
                console.log(`   Context: "${context.replace(/\s+/g, ' ').substring(0, 150)}"`);
                return true;
            }
        }
    }
    
    // Method 3: Look for JSON data with live status
    if (html.includes('window._sharedData')) {
        console.log('📦 Found _sharedData, checking for live status...');
        
        const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});/s);
        if (sharedDataMatch) {
            try {
                const sharedData = JSON.parse(sharedDataMatch[1]);
                const jsonStr = JSON.stringify(sharedData);
                
                if (jsonStr.includes('"is_live":true') ||
                    jsonStr.includes('"broadcast_status":"active"') ||
                    jsonStr.includes('"media_type":4')) {
                    console.log('🔴 LIVE DETECTED: Found live status in JSON data!');
                    return true;
                }
                
                console.log('📦 JSON data checked - no live status found');
            } catch (e) {
                console.log('❌ Failed to parse _sharedData');
            }
        }
    }
    
    // Method 4: Look for specific live badge patterns from your original HTML
    const liveBadgePatterns = [
        /<span[^>]*style="[^"]*border:\s*2px\s+solid\s+rgb\(255,\s*255,\s*255\)[^"]*"[^>]*>直播<\/span>/i,
        /<span[^>]*class="[^"]*x972fbf[^"]*"[^>]*style="[^"]*border:[^"]*"[^>]*>直播<\/span>/i,
        /<div[^>]*class="[^"]*x6s0dn4[^"]*"[^>]*>[\s\S]*?<span[^>]*>直播<\/span>[\s\S]*?<\/div>/i
    ];
    
    for (const pattern of liveBadgePatterns) {
        const match = html.match(pattern);
        if (match) {
            console.log(`🔴 LIVE DETECTED: Found specific live badge pattern!`);
            console.log(`   Pattern: "${match[0].substring(0, 200)}"`);
            return true;
        }
    }
    
    console.log('⚫ No live content detected');
    return false;
}

// Main live status checking function
async function checkLiveStatus() {
    try {
        console.log(`🔍 Checking @${TARGET_USERNAME} live status...`);
        
        const result = await getDynamicInstagramContent();
        
        if (!result) {
            console.log('❌ Failed to get any content');
            return false;
        }
        
        if (result.forcedResult !== undefined) {
            return result.forcedResult;
        }
        
        const isLive = checkForLiveContent(result.html);
        
        console.log(`📊 Result from ${result.strategy}: ${isLive ? '🔴 LIVE' : '⚫ Offline'}`);
        return isLive;
        
    } catch (error) {
        console.error('❌ Error checking live status:', error);
        return false;
    }
}

// Simple login verification
async function verifyInstagramLogin() {
    try {
        console.log('🔍 Verifying Instagram login...');
        
        const response = await makeRequest(`https://www.instagram.com/${TARGET_USERNAME}/`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`
            }
        });
        
        if (response.statusCode === 200 && 
            response.data.includes(TARGET_USERNAME) && 
            !response.data.includes('Log in')) {
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
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Dynamic HTML Check)`);
    
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
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Auto HTML Check) ✅\n\n⚡ 每分鐘自動檢查 HTML 中的"直播"標誌`);
    
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
            console.log('\n🔄 --- Starting check cycle ---');
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
            
            console.log('🔄 --- Check cycle complete ---\n');
            
        } catch (error) {
            console.error('❌ Error in monitoring loop:', error);
        }
    }, 60 * 1000); // Check every 1 minute
    
    // Heartbeat every 10 minutes
    setInterval(() => {
        console.log(`💓 Auto monitor active - @${TARGET_USERNAME} | ${isLiveNow ? '🔴 LIVE' : '⚫ Offline'} | ${new Date().toLocaleString('zh-TW')}`);
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