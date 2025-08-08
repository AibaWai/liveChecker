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
            
        } catch (error) {
            console.log(`❌ ${strategy.name} failed: ${error.message}`);
        }
    }
    
    return false;
}

// DEBUG: Enhanced HTML analysis with detailed logging
async function analyzeHTMLForLive(html, strategy) {
    console.log(`🔍 === DETAILED DEBUG ANALYSIS FROM ${strategy} ===`);
    
    // Method 1: Direct text search with FULL context analysis
    const liveTexts = ['直播', 'LIVE', 'Live'];
    
    for (const liveText of liveTexts) {
        const indices = [];
        let index = html.indexOf(liveText);
        
        while (index !== -1) {
            indices.push(index);
            index = html.indexOf(liveText, index + 1);
        }
        
        if (indices.length > 0) {
            console.log(`\n🔍 === ANALYZING "${liveText}" (${indices.length} occurrences) ===`);
            
            for (let i = 0; i < Math.min(indices.length, 10); i++) {
                const idx = indices[i];
                const context = html.substring(Math.max(0, idx - 300), idx + 300);
                
                console.log(`\n--- Occurrence ${i + 1} at position ${idx} ---`);
                console.log(`Context: "${context.replace(/\s+/g, ' ')}"`);
                
                // Detailed analysis
                const analysis = analyzeContextDetailed(context, liveText);
                console.log(`Analysis: ${JSON.stringify(analysis, null, 2)}`);
                
                if (analysis.isRealLive) {
                    console.log(`🔴 REAL LIVE INDICATOR FOUND AT OCCURRENCE ${i + 1}!`);
                    console.log(`🎯 Context: "${context.replace(/\s+/g, ' ').substring(0, 200)}"`);
                    return true;
                }
            }
        } else {
            console.log(`❌ No occurrences of "${liveText}" found`);
        }
    }
    
    // Method 2: Search for specific HTML patterns
    console.log(`\n🔍 === SEARCHING FOR HTML PATTERNS ===`);
    
    const htmlPatterns = [
        // Pattern from your original HTML
        /<span[^>]*style="[^"]*border:\s*2px\s+solid[^"]*"[^>]*>[^<]*<\/span>/gi,
        /<span[^>]*>直播<\/span>/gi,
        /<div[^>]*class="[^"]*x6s0dn4[^"]*"[^>]*>/gi,
        /<span[^>]*class="[^"]*x972fbf[^"]*"[^>]*>/gi
    ];
    
    for (let i = 0; i < htmlPatterns.length; i++) {
        const pattern = htmlPatterns[i];
        const matches = html.match(pattern);
        
        if (matches) {
            console.log(`\n📋 Pattern ${i + 1} found ${matches.length} matches:`);
            for (let j = 0; j < Math.min(matches.length, 3); j++) {
                console.log(`   Match ${j + 1}: "${matches[j]}"`);
                
                // Check if this match contains live indicators
                if (matches[j].includes('直播') || matches[j].includes('LIVE')) {
                    console.log(`🔴 LIVE PATTERN MATCH FOUND!`);
                    return true;
                }
            }
        } else {
            console.log(`❌ Pattern ${i + 1}: No matches`);
        }
    }
    
    // Method 3: Search for JSON data
    console.log(`\n🔍 === SEARCHING FOR JSON DATA ===`);
    
    // Look for _sharedData
    const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});/s);
    if (sharedDataMatch) {
        console.log(`📦 Found _sharedData (${sharedDataMatch[1].length} chars)`);
        
        const jsonStr = sharedDataMatch[1];
        
        // Check for live indicators in JSON
        const liveJsonPatterns = [
            '"is_live":true',
            '"broadcast_status":"active"',
            '"media_type":4',
            'GraphLiveVideo'
        ];
        
        for (const pattern of liveJsonPatterns) {
            if (jsonStr.includes(pattern)) {
                console.log(`🔴 LIVE JSON PATTERN FOUND: ${pattern}`);
                
                // Show context
                const index = jsonStr.indexOf(pattern);
                const context = jsonStr.substring(Math.max(0, index - 200), index + 200);
                console.log(`🎯 JSON Context: ${context}`);
                return true;
            }
        }
        
        console.log(`❌ No live indicators in _sharedData`);
    } else {
        console.log(`❌ No _sharedData found`);
    }
    
    console.log(`\n🔍 === DEBUG ANALYSIS COMPLETE ===`);
    return false;
}

// Detailed context analysis with full logging
function analyzeContextDetailed(context, liveText) {
    const contextLower = context.toLowerCase();
    
    // Check for false positives
    const falsePositives = [
        '--ig-live',
        'css',
        'stylesheet', 
        'script',
        'comment',
        'border-radius',
        'font-family',
        'padding',
        'margin',
        'variable',
        'color:',
        'background:'
    ];
    
    const foundFalsePositives = [];
    for (const fp of falsePositives) {
        if (contextLower.includes(fp)) {
            foundFalsePositives.push(fp);
        }
    }
    
    // Look for positive indicators
    const positiveIndicators = [
        '<span',
        '<div',
        'class=',
        'style="border:',
        'font-size:',
        'border-radius:'
    ];
    
    const foundPositiveIndicators = [];
    for (const pi of positiveIndicators) {
        if (contextLower.includes(pi)) {
            foundPositiveIndicators.push(pi);
        }
    }
    
    // Determine if it's real
    const hasFalsePositives = foundFalsePositives.length > 0;
    const hasPositiveIndicators = foundPositiveIndicators.length >= 2;
    const isRealLive = !hasFalsePositives && hasPositiveIndicators;
    
    return {
        liveText,
        foundFalsePositives,
        foundPositiveIndicators,
        hasFalsePositives,
        hasPositiveIndicators,
        isRealLive
    };
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
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (DEBUG Context Analysis)`);
    
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
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (DEBUG) ✅`);
    
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
    
    // Monitor every 60 seconds for debugging
    console.log('⏰ Starting monitoring loop (every 60 seconds)...');
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
    }, 60 * 1000); // Check every 60 seconds for debugging
    
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