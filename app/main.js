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

// Check live status by examining actual HTML content
async function checkLiveStatus() {
    try {
        console.log(`🔍 Checking if @${TARGET_USERNAME} is live...`);
        
        const headers = {
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
        };
        
        const url = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const response = await makeRequest(url, {
            method: 'GET',
            headers: headers
        });
        
        if (response.statusCode !== 200) {
            console.log(`❌ HTTP ${response.statusCode}`);
            return false;
        }
        
        const html = response.data;
        console.log(`📊 Received HTML: ${html.length} characters`);
        
        // === DETAILED HTML CONTENT ANALYSIS ===
        console.log('\n🔍 === ANALYZING ACTUAL HTML CONTENT ===');
        
        // Show HTML structure
        console.log('\n📋 HTML Document Structure:');
        const docTypeMatch = html.match(/<!DOCTYPE[^>]*>/i);
        console.log(`   DOCTYPE: ${docTypeMatch ? docTypeMatch[0] : 'Not found'}`);
        
        const htmlTagMatch = html.match(/<html[^>]*>/i);
        console.log(`   HTML tag: ${htmlTagMatch ? htmlTagMatch[0].substring(0, 100) + '...' : 'Not found'}`);
        
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        console.log(`   Title: ${titleMatch ? titleMatch[1] : 'Not found'}`);
        
        const bodyMatch = html.match(/<body[^>]*>/i);
        console.log(`   Body tag: ${bodyMatch ? bodyMatch[0].substring(0, 100) + '...' : 'Not found'}`);
        
        // Show first 2000 characters of HTML
        console.log('\n📄 HTML Content (first 2000 chars):');
        console.log('='.repeat(80));
        console.log(html.substring(0, 2000));
        console.log('='.repeat(80));
        
        // Show last 1000 characters of HTML
        console.log('\n📄 HTML Content (last 1000 chars):');
        console.log('='.repeat(80));
        console.log(html.substring(Math.max(0, html.length - 1000)));
        console.log('='.repeat(80));
        
        // Look for main content area
        console.log('\n🔍 Searching for main content structures...');
        
        const mainPatterns = [
            /<main[^>]*>/i,
            /<div[^>]*id="react-root"[^>]*>/i,
            /<div[^>]*role="main"[^>]*>/i,
            /<section[^>]*>/i,
            /<article[^>]*>/i,
            /<div[^>]*class="[^"]*container[^"]*"[^>]*>/i
        ];
        
        for (let i = 0; i < mainPatterns.length; i++) {
            const pattern = mainPatterns[i];
            const match = html.match(pattern);
            if (match) {
                console.log(`✅ Found main structure ${i + 1}: ${match[0]}`);
                
                // Show content around this structure
                const index = html.indexOf(match[0]);
                const surrounding = html.substring(index, index + 500);
                console.log(`   Content: ${surrounding.replace(/\s+/g, ' ')}`);
            } else {
                console.log(`❌ Main pattern ${i + 1}: Not found`);
            }
        }
        
        // Check for JavaScript/React content
        console.log('\n🔍 Checking for JavaScript/React content...');
        const jsPatterns = [
            /window\._sharedData/,
            /react/i,
            /__d\(/,
            /require\(/,
            /"props":/,
            /"state":/
        ];
        
        for (const pattern of jsPatterns) {
            const match = html.match(pattern);
            if (match) {
                console.log(`✅ Found JS pattern: ${pattern} -> "${match[0]}"`);
            } else {
                console.log(`❌ JS pattern not found: ${pattern}`);
            }
        }
        
        // Check what type of page we're getting
        console.log('\n🔍 Page Type Analysis:');
        
        if (html.includes('Log in')) {
            console.log('🚨 This appears to be a LOGIN PAGE!');
            console.log('   Possible reasons: Cookies expired, IP blocked, or access denied');
            return false;
        }
        
        if (html.length < 10000) {
            console.log('⚠️ HTML is suspiciously short - might be an error page');
        }
        
        if (html.includes('error') || html.includes('Error')) {
            console.log('⚠️ HTML contains error keywords');
        }
        
        if (html.includes(TARGET_USERNAME)) {
            console.log(`✅ HTML contains target username: ${TARGET_USERNAME}`);
        } else {
            console.log(`❌ HTML does NOT contain target username: ${TARGET_USERNAME}`);
        }
        
        // Look for specific Instagram elements
        console.log('\n🔍 Looking for Instagram-specific elements...');
        
        const igElements = [
            'instagram',
            'profile',
            'avatar',
            'follow',
            'post',
            'story',
            'bio'
        ];
        
        for (const element of igElements) {
            if (html.toLowerCase().includes(element)) {
                console.log(`✅ Found Instagram element: ${element}`);
            } else {
                console.log(`❌ Missing Instagram element: ${element}`);
            }
        }
        
        // Finally, check for any Chinese text
        console.log('\n🔍 Checking for Chinese text...');
        const chineseMatches = html.match(/[\u4e00-\u9fff]+/g);
        if (chineseMatches && chineseMatches.length > 0) {
            const uniqueChinese = [...new Set(chineseMatches)];
            console.log(`✅ Found Chinese text (${uniqueChinese.length} unique): ${uniqueChinese.slice(0, 10).join(', ')}`);
            
            // Check specifically for live-related Chinese
            const liveTerms = ['直播', '直播中', '現在直播', '實況'];
            for (const term of liveTerms) {
                if (html.includes(term)) {
                    console.log(`🔴 FOUND LIVE TERM: ${term}`);
                    return true;
                }
            }
        } else {
            console.log('❌ No Chinese text found');
        }
        
        console.log('\n🔍 === HTML ANALYSIS COMPLETE ===');
        
        return false;
        
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
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (HTML Content Analysis)`);
    
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
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (HTML Analysis) ✅`);
    
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
    
    // For debugging, only run once
    console.log('🔍 DEBUG: Running single check only');
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