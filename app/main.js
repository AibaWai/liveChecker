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

// Multiple request strategies
async function checkLiveWithMultipleStrategies() {
    const strategies = [
        // Strategy 1: Chrome Desktop
        {
            name: 'Chrome Desktop',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`,
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        },
        
        // Strategy 2: iPhone Safari  
        {
            name: 'iPhone Safari',
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`,
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        },
        
        // Strategy 3: Android Chrome
        {
            name: 'Android Chrome',  
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`,
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?1',
                'Sec-Ch-Ua-Platform': '"Android"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        }
    ];
    
    for (const strategy of strategies) {
        try {
            console.log(`🔎 Trying ${strategy.name} strategy...`);
            
            const url = `https://www.instagram.com/${TARGET_USERNAME}/`;
            const response = await makeRequest(url, {
                method: 'GET',
                headers: strategy.headers
            });
            
            if (response.statusCode === 200) {
                const html = response.data;
                console.log(`📊 ${strategy.name}: ${html.length} chars received`);
                
                // Enhanced live detection with multiple approaches
                const liveCheck = await analyzeHTMLForLive(html, strategy.name);
                if (liveCheck) {
                    console.log(`🔴 LIVE detected using ${strategy.name}!`);
                    return true;
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
    
    return false;
}

// Advanced HTML analysis
async function analyzeHTMLForLive(html, strategy) {
    console.log(`🔍 Analyzing HTML from ${strategy}...`);
    
    // Method 1: Direct text search with context analysis
    const liveTexts = ['直播', 'LIVE', 'En vivo', 'Live', 'ライブ', '라이브'];
    
    for (const liveText of liveTexts) {
        const indices = [];
        let index = html.indexOf(liveText);
        
        while (index !== -1) {
            indices.push(index);
            index = html.indexOf(liveText, index + 1);
        }
        
        if (indices.length > 0) {
            console.log(`🔍 Found ${indices.length} occurrences of "${liveText}"`);
            
            for (let i = 0; i < Math.min(indices.length, 3); i++) {
                const idx = indices[i];
                const context = html.substring(Math.max(0, idx - 200), idx + 200);
                
                // Analyze context to determine if it's a real live indicator
                const isRealLive = analyzeContext(context, liveText);
                if (isRealLive) {
                    console.log(`🔴 Real live indicator found: "${context.replace(/\s+/g, ' ').substring(0, 100)}"`);
                    return true;
                }
            }
        }
    }
    
    // Method 2: JSON data extraction with improved parsing
    const jsonPatterns = [
        /window\._sharedData\s*=\s*({.*?});/s,
        /"is_live"\s*:\s*true/g,
        /"broadcast_status"\s*:\s*"active"/g,
        /"__typename"\s*:\s*"Graph.*?Live.*?Video"/g
    ];
    
    for (const pattern of jsonPatterns) {
        const matches = html.match(pattern);
        if (matches) {
            console.log(`🔍 Found JSON pattern: ${pattern.toString().substring(0, 50)}...`);
            
            if (pattern.toString().includes('is_live') || 
                pattern.toString().includes('broadcast_status') ||
                pattern.toString().includes('Live')) {
                console.log('🔴 Live indicator in JSON!');
                return true;
            }
        }
    }
    
    // Method 3: Meta tag analysis
    const metaLivePattern = /<meta[^>]*(?:live|broadcast)[^>]*>/gi;
    const metaMatches = html.match(metaLivePattern);
    if (metaMatches) {
        console.log(`🔍 Found ${metaMatches.length} meta tags with live/broadcast`);
        for (const meta of metaMatches) {
            if (meta.includes('true') || meta.includes('active')) {
                console.log(`🔴 Live meta tag: ${meta}`);
                return true;
            }
        }
    }
    
    return false;
}

// Analyze context to determine if live text is real
function analyzeContext(context, liveText) {
    const contextLower = context.toLowerCase();
    
    // Exclude false positives
    const falsePositives = [
        '--ig-live',
        'css',
        'stylesheet', 
        'script',
        'comment',
        'border-radius',
        'font-family',
        'padding',
        'margin'
    ];
    
    for (const fp of falsePositives) {
        if (contextLower.includes(fp)) {
            return false;
        }
    }
    
    // Look for positive indicators
    const positiveIndicators = [
        '<span',
        '<div',
        'class=',
        'style=',
        'border:',
        'padding:',
        'font-size:'
    ];
    
    let positiveCount = 0;
    for (const pi of positiveIndicators) {
        if (contextLower.includes(pi)) {
            positiveCount++;
        }
    }
    
    // If we have HTML structure around the live text, it's likely real
    return positiveCount >= 2;
}

// Simple login verification
async function verifyInstagramLogin() {
    try {
        console.log('🔍 Verifying Instagram login...');
        
        const response = await makeRequest(`https://www.instagram.com/${TARGET_USERNAME}/`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`
            }
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
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Smart HTML Analysis)`);
    
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
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Smart Analysis) ✅`);
    
    // Initial check
    console.log('🔎 Performing initial live status check...');
    try {
        const initialStatus = await checkLiveWithMultipleStrategies();
        isLiveNow = initialStatus;
        
        if (initialStatus) {
            await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is currently LIVE! 🎥\nhttps://www.instagram.com/${TARGET_USERNAME}/`);
        } else {
            console.log('✅ Initial check complete - not currently live');
        }
    } catch (error) {
        console.error('❌ Initial check failed:', error);
    }
    
    // Monitor every 45 seconds
    console.log('⏰ Starting monitoring loop (every 45 seconds)...');
    setInterval(async () => {        
        try {
            const currentlyLive = await checkLiveWithMultipleStrategies();
            
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
    }, 45 * 1000); // Check every 45 seconds
    
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