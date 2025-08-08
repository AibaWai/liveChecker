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
        console.error('Missing required environment variables!');
        return;
    }
    
    if (!IG_SESSION_ID || !IG_CSRF_TOKEN || !IG_DS_USER_ID) {
        console.error('Missing Instagram cookie environment variables!');
        sendDiscordMessage('❌ Missing Instagram cookies! Please set IG_SESSION_ID, IG_CSRF_TOKEN, IG_DS_USER_ID');
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

// Check Instagram access and live status
async function checkLiveStatus() {
    try {
        console.log('🔍 Checking Instagram with cookies...');
        
        const url = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const response = await makeRequest(url, {
            method: 'GET',
            headers: getInstagramHeaders()
        });
        
        console.log(`📊 Response status: ${response.statusCode}`);
        console.log(`📊 Content length: ${response.data.length} characters`);
        console.log(`📊 Content encoding: ${response.headers['content-encoding'] || 'none'}`);
        console.log(`📊 Content type: ${response.headers['content-type'] || 'unknown'}`);
        
        // Handle redirects (likely means cookies expired)
        if (response.statusCode === 301 || response.statusCode === 302) {
            console.log(`❌ Redirect detected to: ${response.redirectLocation}`);
            if (response.redirectLocation && response.redirectLocation.includes('accounts/login')) {
                console.log('🚨 Redirected to login page - cookies expired!');
                cookiesValid = false;
                await sendDiscordMessage('🚨 Instagram cookies expired! Please update IG_SESSION_ID, IG_CSRF_TOKEN, and IG_DS_USER_ID environment variables.');
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
            cookiesValid = false;
            await sendDiscordMessage('🚨 Instagram cookies invalid! Got login page despite using cookies.');
            return false;
        }
        
        console.log('✅ Successfully accessed Instagram profile page');
        console.log('📄 HTML Preview (first 500 chars):');
        console.log(html.substring(0, 500));
        
        // Check if HTML contains meaningful content
        if (html.length < 1000 || !html.includes('<html') && !html.includes('<!DOCTYPE')) {
            console.log('❌ Received invalid or incomplete HTML content');
            console.log('📄 Raw content sample:', response.data.substring(0, 200));
            return false;
        }
        
        // Enhanced live detection patterns - More specific to avoid false positives
        const livePatterns = [
            // Direct broadcast status (most reliable)
            /"broadcast_status":"active"/,
            /"broadcast":{"broadcast_status":"active"/,
            /broadcastStatus":"active"/,
            
            // Live flags in user data
            /"is_live":true/,
            /"isLive":true/,
            
            // GraphQL live video type (very reliable)
            /"__typename":"GraphLiveVideo"/,
            /GraphLiveVideo/,
            
            // Media type 4 (live video in stories/posts)
            /"media_type":4.*live/i,
            
            // Story live indicators
            /"story_type":"live"/,
            
            // Live broadcast data
            /broadcast_owner/,
            /dash_live_encodings/,
            /"live_video_id":/,
            /viewer_count.*broadcast/,
            
            // UI elements - but more specific to avoid CSS false positives
            /class="[^"]*ig-live-badge[^"]*"[^>]*>[^<]*LIVE/i,
            /aria-label="Live[^"]*"[^>]*>[^<]*LIVE/i,
            /<[^>]*live-video-indicator[^>]*>/i,
            
            // Live status in actual content (not CSS)
            />\s*LIVE\s*<\/[^>]*span>/i,
            /data-[^=]*="[^"]*live[^"]*"[^>]*>.*LIVE/i
        ];
        
        console.log('🔎 Scanning for live indicators...');
        let foundPatterns = [];
        let detectedLive = false;
        
        // First, exclude CSS definitions and style blocks
        const htmlWithoutStyles = html.replace(/<style[^>]*>.*?<\/style>/gis, '')
                                     .replace(/--ig-[^;]*;/g, '')
                                     .replace(/style="[^"]*"/g, '');
        
        for (let i = 0; i < livePatterns.length; i++) {
            const pattern = livePatterns[i];
            const matches = htmlWithoutStyles.match(pattern);
            if (matches) {
                foundPatterns.push(`Pattern ${i + 1}: ${pattern.toString()}`);
                console.log(`✅ Found live indicator: ${pattern.toString()}`);
                
                // Show context around the match
                const matchIndex = htmlWithoutStyles.indexOf(matches[0]);
                const start = Math.max(0, matchIndex - 100);
                const end = Math.min(htmlWithoutStyles.length, matchIndex + 100);
                console.log(`🎯 Context: "${htmlWithoutStyles.substring(start, end)}"`);
                
                // Additional validation - make sure it's not in a CSS context
                const contextBefore = htmlWithoutStyles.substring(Math.max(0, matchIndex - 200), matchIndex);
                if (!contextBefore.includes('--ig-') && !contextBefore.includes('css') && !contextBefore.includes('style')) {
                    detectedLive = true;
                    break;
                }
            }
        }
        
        if (detectedLive) {
            console.log(`🔴 LIVE DETECTED! Found patterns: ${foundPatterns.length}`);
            return true;
        }
        
        // Additional check: Look for window._sharedData
        const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});/s);
        if (sharedDataMatch) {
            console.log('📦 Found window._sharedData, parsing...');
            try {
                const sharedData = JSON.parse(sharedDataMatch[1]);
                const profilePage = sharedData?.entry_data?.ProfilePage?.[0];
                const user = profilePage?.graphql?.user;
                
                if (user) {
                    console.log(`👤 Found user data for: ${user.username}`);
                    
                    // Check broadcast in user data
                    if (user.broadcast) {
                        console.log('📡 Broadcast data found:', JSON.stringify(user.broadcast, null, 2));
                        if (user.broadcast.broadcast_status === 'active') {
                            console.log('🔴 LIVE detected via _sharedData broadcast!');
                            return true;
                        }
                    }
                    
                    if (user.is_live === true) {
                        console.log('🔴 LIVE detected via _sharedData is_live flag!');
                        return true;
                    }
                    
                    console.log('📊 User live status: false');
                }
            } catch (e) {
                console.log('❌ Failed to parse _sharedData:', e.message);
            }
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
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Cookies Version)`);
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Using Instagram Cookies)`);
    
    // Initial check
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
    
    // Monitor every minute
    console.log('⏰ Starting monitoring loop (every 60 seconds)...');
    setInterval(async () => {
        if (!cookiesValid) {
            console.log('⏭️ Skipping check - cookies invalid');
            return;
        }
        
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
    }, 60 * 1000); // Check every minute
    
    // Keep alive heartbeat
    setInterval(() => {
        console.log(`💓 Bot heartbeat - monitoring @${TARGET_USERNAME} | Live: ${isLiveNow ? '🔴' : '⚫'} | Cookies: ${cookiesValid ? '✅' : '❌'} | ${new Date().toISOString()}`);
    }, 10 * 60 * 1000); // Every 10 minutes
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