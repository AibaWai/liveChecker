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

// Get Instagram headers with cookies
function getInstagramHeaders() {
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
        
        // Handle redirects (likely means cookies expired)
        if (response.statusCode === 301 || response.statusCode === 302) {
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
        
        // Check if we got login page
        if (html.includes('accounts/login') || html.includes('Log in to Instagram')) {
            console.log('❌ Received login page despite using cookies');
            return false;
        }
        
        console.log('✅ Successfully accessed Instagram profile page');
        return true;
        
    } catch (error) {
        console.error('❌ Error verifying login:', error);
        return false;
    }
}

// DEBUG: Enhanced live status check with full HTML analysis
async function checkLiveStatus() {
    try {
        console.log(`🔍 Checking if @${TARGET_USERNAME} is live...`);
        
        const url = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const response = await makeRequest(url, {
            method: 'GET',
            headers: getInstagramHeaders()
        });
        
        if (response.statusCode !== 200) {
            console.log(`❌ HTTP ${response.statusCode}`);
            return false;
        }
        
        const html = response.data;
        console.log(`📊 HTML length: ${html.length} characters`);
        
        // DEBUG: Show actual HTML content around profile area
        console.log('\n🔍 === DEBUG: HTML CONTENT ANALYSIS ===');
        
        // Look for header section specifically
        const headerMatch = html.match(/<header[^>]*>[\s\S]*?<\/header>/i);
        if (headerMatch) {
            const headerContent = headerMatch[0];
            console.log(`📋 Found header section (${headerContent.length} chars)`);
            console.log(`📋 Header content preview: ${headerContent.substring(0, 500).replace(/\s+/g, ' ')}`);
            
            // Check if header contains "直播"
            if (headerContent.includes('直播')) {
                console.log('🔴 FOUND "直播" IN HEADER!');
                
                // Show exact context
                const liveIndex = headerContent.indexOf('直播');
                const context = headerContent.substring(Math.max(0, liveIndex - 200), liveIndex + 200);
                console.log(`🎯 "直播" context: ${context.replace(/\s+/g, ' ')}`);
                return true;
            } else {
                console.log('❌ No "直播" found in header');
            }
        } else {
            console.log('❌ No header section found');
        }
        
        // DEBUG: Search for any occurrence of "直播" in entire HTML
        console.log('\n🔍 Searching entire HTML for "直播"...');
        const allLiveMatches = [];
        let searchIndex = 0;
        
        while (true) {
            const liveIndex = html.indexOf('直播', searchIndex);
            if (liveIndex === -1) break;
            
            const context = html.substring(Math.max(0, liveIndex - 100), liveIndex + 100);
            allLiveMatches.push({
                position: liveIndex,
                context: context.replace(/\s+/g, ' ')
            });
            
            searchIndex = liveIndex + 1;
        }
        
        console.log(`📊 Found ${allLiveMatches.length} occurrences of "直播" in HTML`);
        
        for (let i = 0; i < Math.min(allLiveMatches.length, 5); i++) {
            const match = allLiveMatches[i];
            console.log(`   ${i + 1}. Position ${match.position}: "${match.context}"`);
        }
        
        if (allLiveMatches.length > 0) {
            console.log('🔴 FOUND "直播" IN HTML - USER IS LIVE!');
            return true;
        }
        
        // DEBUG: Search for common live-related terms
        console.log('\n🔍 Searching for other live indicators...');
        const liveTerms = ['LIVE', 'live', 'broadcast', '直播中', '現在直播', 'streaming'];
        
        for (const term of liveTerms) {
            const termIndex = html.indexOf(term);
            if (termIndex !== -1) {
                const context = html.substring(Math.max(0, termIndex - 100), termIndex + 100);
                console.log(`🔍 Found "${term}" at position ${termIndex}: "${context.replace(/\s+/g, ' ').substring(0, 200)}"`);
            }
        }
        
        // DEBUG: Show profile username area
        console.log('\n🔍 Looking for profile username area...');
        const usernamePattern = new RegExp(`${TARGET_USERNAME}`, 'gi');
        const usernameMatches = html.match(usernamePattern);
        if (usernameMatches) {
            console.log(`📊 Found ${usernameMatches.length} mentions of username`);
            
            // Find the first username mention and show context
            const firstUsernameIndex = html.indexOf(TARGET_USERNAME);
            const usernameContext = html.substring(Math.max(0, firstUsernameIndex - 500), firstUsernameIndex + 500);
            console.log(`📋 Username context: ${usernameContext.replace(/\s+/g, ' ').substring(0, 800)}`);
        }
        
        // DEBUG: Look for span elements that might contain live indicators
        console.log('\n🔍 Analyzing span elements...');
        const spanRegex = /<span[^>]*>([^<]+)<\/span>/gi;
        let spanMatch;
        let spanCount = 0;
        
        while ((spanMatch = spanRegex.exec(html)) !== null && spanCount < 20) {
            spanCount++;
            const spanContent = spanMatch[1].trim();
            
            if (spanContent.includes('直播') || spanContent.includes('LIVE') || spanContent.includes('live')) {
                console.log(`🔍 Span ${spanCount} with live content: "${spanMatch[0].substring(0, 200)}"`);
            } else if (spanContent.length < 20 && spanContent.length > 0) {
                // Show short span contents that might be relevant
                console.log(`🔍 Span ${spanCount}: "${spanContent}"`);
            }
        }
        
        console.log('🔍 === END DEBUG ANALYSIS ===\n');
        
        console.log('⚫ No live indicators found - user is not live');
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
    const loginValid = await verifyInstagramLogin();
    
    if (!loginValid) {
        const errorMsg = '❌ Instagram login failed! Please update your cookies and restart.';
        console.error(errorMsg);
        await sendDiscordMessage(errorMsg);
        console.log('🛑 Stopping service due to authentication failure...');
        process.exit(1);
    }
    
    console.log('✅ Instagram login verified!');
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} ✅`);
    
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
    
    // Monitor every 2 minutes for debugging (less frequent to see logs clearly)
    console.log('⏰ Starting monitoring loop (every 2 minutes)...');
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