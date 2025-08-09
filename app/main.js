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

// Get dynamic content with detailed debugging
async function getDynamicInstagramContent() {
    try {
        console.log(`🔎 Getting content for @${TARGET_USERNAME}...`);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}; mid=ZnH2YAAEAAFONwllOTI_7qW3kJMY; ig_cb=2`,
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
        
        const url = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const response = await makeRequest(url, {
            method: 'GET',
            headers: headers
        });
        
        if (response.statusCode !== 200) {
            console.log(`❌ HTTP ${response.statusCode}`);
            return null;
        }
        
        const html = response.data;
        console.log(`📊 Received HTML: ${html.length} characters`);
        
        return { html, strategy: 'Debug Analysis' };
        
    } catch (error) {
        console.error('❌ Error getting content:', error);
        return null;
    }
}

// Enhanced live content detection with detailed logging
function checkForLiveContent(html) {
    console.log('\n🔍 === DETAILED LIVE CONTENT ANALYSIS ===');
    
    // Show HTML structure
    console.log('\n📋 HTML Document Analysis:');
    const docTypeMatch = html.match(/<!DOCTYPE[^>]*>/i);
    console.log(`   DOCTYPE: ${docTypeMatch ? docTypeMatch[0] : 'Not found'}`);
    
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    console.log(`   Title: ${titleMatch ? titleMatch[1] : 'Not found'}`);
    
    // Check for login page
    if (html.includes('Log in') || html.includes('登入') || html.includes('Login')) {
        console.log('🚨 WARNING: This might be a login page!');
    }
    
    // Show first 1000 chars of body content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        const bodyContent = bodyMatch[1];
        console.log(`\n📄 Body content (first 500 chars):`);
        console.log('='.repeat(60));
        console.log(bodyContent.substring(0, 500).replace(/\s+/g, ' '));
        console.log('='.repeat(60));
    } else {
        console.log('❌ No body tag found');
    }
    
    // Method 1: Comprehensive search for "直播"
    console.log('\n🔍 Method 1: Comprehensive "直播" search...');
    
    let allLiveOccurrences = [];
    let searchIndex = 0;
    
    while (true) {
        const liveIndex = html.indexOf('直播', searchIndex);
        if (liveIndex === -1) break;
        
        const context = html.substring(Math.max(0, liveIndex - 300), liveIndex + 300);
        allLiveOccurrences.push({
            position: liveIndex,
            context: context.replace(/\s+/g, ' ')
        });
        
        searchIndex = liveIndex + 1;
    }
    
    console.log(`📊 Found ${allLiveOccurrences.length} total occurrences of "直播"`);
    
    if (allLiveOccurrences.length > 0) {
        console.log('\n🔍 Analyzing each occurrence:');
        
        for (let i = 0; i < Math.min(allLiveOccurrences.length, 10); i++) {
            const occurrence = allLiveOccurrences[i];
            console.log(`\n--- Occurrence ${i + 1} at position ${occurrence.position} ---`);
            console.log(`Context: "${occurrence.context.substring(0, 400)}"`);
            
            // Detailed analysis
            const context = occurrence.context;
            const isFalsePositive = [
                context.includes('--ig-live'),
                context.includes('css'),
                context.includes('script'),
                context.includes('VideoPlayerWithLive'),
                context.includes('live-badge'),
                context.includes('color:'),
                context.includes('background:')
            ];
            
            const hasPositiveIndicators = [
                context.includes('<span'),
                context.includes('<div'),
                context.includes('class='),
                context.includes('style='),
                context.includes('border:'),
                context.includes('font-size:')
            ];
            
            const falsePositiveCount = isFalsePositive.filter(Boolean).length;
            const positiveIndicatorCount = hasPositiveIndicators.filter(Boolean).length;
            
            console.log(`   False positive indicators: ${falsePositiveCount}`);
            console.log(`   Positive indicators: ${positiveIndicatorCount}`);
            
            if (falsePositiveCount === 0 && positiveIndicatorCount >= 2) {
                console.log(`🔴 POTENTIAL LIVE FOUND at occurrence ${i + 1}!`);
                
                // Show more detailed context
                const extendedContext = html.substring(
                    Math.max(0, occurrence.position - 500), 
                    occurrence.position + 500
                );
                console.log(`🎯 Extended context: "${extendedContext.replace(/\s+/g, ' ')}"`);
                
                return true;
            }
        }
    }
    
    // Method 2: Look for LIVE in English with context
    console.log('\n🔍 Method 2: English "LIVE" search...');
    
    const englishLiveMatches = html.match(/\bLIVE\b/g);
    if (englishLiveMatches && englishLiveMatches.length > 0) {
        console.log(`📊 Found ${englishLiveMatches.length} occurrences of "LIVE"`);
        
        let validLiveFound = false;
        for (let i = 0; i < Math.min(englishLiveMatches.length, 5); i++) {
            const index = html.indexOf('LIVE', i > 0 ? html.lastIndexOf('LIVE', html.indexOf('LIVE') + 1) : 0);
            const context = html.substring(Math.max(0, index - 300), index + 300);
            
            console.log(`   LIVE context ${i + 1}: "${context.replace(/\s+/g, ' ').substring(0, 200)}"`);
            
            if (!context.includes('--ig-live') && 
                !context.includes('VideoPlayerWithLive') && 
                !context.includes('css') &&
                (context.includes('<span') || context.includes('<div'))) {
                
                console.log(`🔴 VALID LIVE FOUND in English!`);
                validLiveFound = true;
                break;
            }
        }
        
        if (validLiveFound) return true;
    }
    
    // Method 3: Check for window._sharedData
    console.log('\n🔍 Method 3: Checking for window._sharedData...');
    
    if (html.includes('window._sharedData')) {
        console.log('📦 Found window._sharedData!');
        
        const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});/s);
        if (sharedDataMatch) {
            try {
                console.log(`📦 _sharedData length: ${sharedDataMatch[1].length} chars`);
                const sharedData = JSON.parse(sharedDataMatch[1]);
                const jsonStr = JSON.stringify(sharedData);
                
                // Check for various live indicators
                const liveIndicators = [
                    '"is_live":true',
                    '"broadcast_status":"active"',
                    '"media_type":4',
                    'GraphLiveVideo',
                    '"__typename":"XDTLiveVideo"'
                ];
                
                for (const indicator of liveIndicators) {
                    if (jsonStr.includes(indicator)) {
                        console.log(`🔴 LIVE DETECTED in JSON: ${indicator}`);
                        
                        // Show context
                        const index = jsonStr.indexOf(indicator);
                        const context = jsonStr.substring(Math.max(0, index - 200), index + 200);
                        console.log(`🎯 JSON context: ${context}`);
                        return true;
                    }
                }
                
                console.log('📦 No live indicators found in _sharedData');
            } catch (e) {
                console.log('❌ Failed to parse _sharedData:', e.message);
            }
        }
    } else {
        console.log('❌ No window._sharedData found');
    }
    
    // Method 4: Look for specific HTML patterns
    console.log('\n🔍 Method 4: Specific HTML pattern search...');
    
    const htmlPatterns = [
        /<span[^>]*style="[^"]*border:\s*2px\s+solid[^"]*"[^>]*>直播<\/span>/gi,
        /<span[^>]*class="[^"]*x972fbf[^"]*"[^>]*>直播<\/span>/gi,
        /<div[^>]*class="[^"]*x6s0dn4[^"]*"[^>]*>[\s\S]*?直播[\s\S]*?<\/div>/gi,
        /<span[^>]*>直播<\/span>/gi
    ];
    
    for (let i = 0; i < htmlPatterns.length; i++) {
        const pattern = htmlPatterns[i];
        const matches = html.match(pattern);
        
        if (matches) {
            console.log(`🔴 HTML PATTERN ${i + 1} MATCH FOUND!`);
            console.log(`   Pattern: ${pattern.toString()}`);
            console.log(`   Matches: ${matches.length}`);
            console.log(`   First match: "${matches[0]}"`);
            return true;
        } else {
            console.log(`❌ HTML pattern ${i + 1}: No matches`);
        }
    }
    
    // Method 5: Check for any Chinese characters
    console.log('\n🔍 Method 5: All Chinese characters analysis...');
    
    const chineseMatches = html.match(/[\u4e00-\u9fff]+/g);
    if (chineseMatches) {
        const uniqueChinese = [...new Set(chineseMatches)];
        console.log(`📊 Found ${uniqueChinese.length} unique Chinese phrases:`);
        console.log(`   First 10: ${uniqueChinese.slice(0, 10).join(', ')}`);
        
        // Check if any contain live-related terms
        const liveTerms = ['直播', '直播中', '現在直播', '實況', 'Live'];
        for (const term of liveTerms) {
            const found = uniqueChinese.find(text => text.includes(term));
            if (found) {
                console.log(`🔴 LIVE TERM FOUND in Chinese text: "${found}"`);
                return true;
            }
        }
    } else {
        console.log('❌ No Chinese characters found at all');
    }
    
    console.log('\n🔍 === ANALYSIS COMPLETE ===');
    console.log('⚫ Final result: No live content detected');
    
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
        
        const isLive = checkForLiveContent(result.html);
        
        console.log(`📊 Final result: ${isLive ? '🔴 LIVE' : '⚫ Offline'}`);
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

// Main monitoring loop - run once for debugging
async function startMonitoring() {
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Detailed Debug)`);
    
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
    
    // Single detailed check
    console.log('🔎 Performing detailed live status check...');
    try {
        const status = await checkLiveStatus();
        
        if (status) {
            await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is LIVE! 🎥\nhttps://www.instagram.com/${TARGET_USERNAME}/`);
        } else {
            console.log('✅ Debug check complete - not currently live');
        }
        
    } catch (error) {
        console.error('❌ Debug check failed:', error);
    }
    
    console.log('🔍 Debug analysis complete. Check logs for details.');
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