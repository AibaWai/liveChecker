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

// Comprehensive live status check
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
        
        // Handle redirects (likely means cookies expired)
        if (response.statusCode === 301 || response.statusCode === 302) {
            console.log(`❌ Redirect detected to: ${response.redirectLocation}`);
            if (response.redirectLocation && response.redirectLocation.includes('accounts/login')) {
                console.log('🚨 Redirected to login page - cookies expired!');
                cookiesValid = false;
                await sendDiscordMessage('🚨 Instagram cookies expired! Please update cookies.');
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
            await sendDiscordMessage('🚨 Instagram cookies invalid!');
            return false;
        }
        
        console.log('✅ Successfully accessed Instagram profile page');
        console.log('📄 HTML Preview (first 300 chars):');
        console.log(html.substring(0, 300));
        
        // Check if we're actually logged in
        console.log('\n🔍 Verifying login status...');
        const loginIndicators = [
            html.includes('Log in'),
            html.includes('Sign up'),
            html.includes('Create account'),
            html.includes('login_form'),
            html.includes('loginForm'),
            !html.includes('feed_timeline'),
            !html.includes('timeline_media')
        ];
        
        const isLoggedIn = !loginIndicators.some(indicator => indicator);
        console.log(`📊 Login status: ${isLoggedIn ? '✅ Logged in' : '❌ Not logged in'}`);
        
        // Check for user-specific elements that indicate successful login
        const userElements = [
            html.includes('direct_v2'),
            html.includes('notifications'),
            html.includes('activity_feed'),
            html.includes('profileMenu'),
            html.includes('"viewer"')
        ];
        
        const hasUserElements = userElements.some(element => element);
        console.log(`📊 User elements: ${hasUserElements ? '✅ Found' : '❌ Missing'}`);
        
        if (!isLoggedIn || !hasUserElements) {
            console.log('⚠️ WARNING: May not be properly logged in to Instagram');
            console.log('This could explain why live status is not visible');
        }
        
        // === COMPREHENSIVE LIVE DETECTION ===
        console.log('\n🔍 === STARTING COMPREHENSIVE LIVE DETECTION ===');
        
        // Method 1: Check window._sharedData
        console.log('🔎 Method 1: Checking window._sharedData...');
        const sharedDataMatches = html.match(/window\._sharedData\s*=\s*({.*?});/s);
        if (sharedDataMatches) {
            try {
                const sharedData = JSON.parse(sharedDataMatches[1]);
                console.log('📦 Found _sharedData');
                
                const profilePage = sharedData?.entry_data?.ProfilePage?.[0];
                const user = profilePage?.graphql?.user;
                
                if (user) {
                    console.log(`👤 User: ${user.username} (${user.full_name})`);
                    
                    // Check broadcast
                    if (user.broadcast) {
                        console.log('📡 Broadcast data:', JSON.stringify(user.broadcast, null, 2));
                        if (user.broadcast.broadcast_status === 'active') {
                            console.log('🔴 LIVE detected via _sharedData broadcast!');
                            return true;
                        }
                    }
                    
                    // Check is_live flag
                    if (user.is_live === true) {
                        console.log('🔴 LIVE detected via _sharedData is_live!');
                        return true;
                    }
                    
                    console.log(`📊 User broadcast: ${user.broadcast || 'null'}, is_live: ${user.is_live}`);
                }
            } catch (e) {
                console.log('❌ Failed to parse _sharedData:', e.message);
            }
        } else {
            console.log('❌ No _sharedData found');
        }
        
        // Method 2: Check all JSON script tags
        console.log('\n🔎 Method 2: Checking JSON script tags...');
        const jsonScriptRegex = /<script type="application\/json"[^>]*>([^<]*)<\/script>/g;
        let jsonScriptMatch;
        let scriptCount = 0;
        
        while ((jsonScriptMatch = jsonScriptRegex.exec(html)) !== null) {
            scriptCount++;
            try {
                const jsonContent = JSON.parse(jsonScriptMatch[1]);
                const jsonString = JSON.stringify(jsonContent);
                
                console.log(`📄 JSON Script ${scriptCount}: ${jsonString.length} chars`);
                
                // Check for live indicators in JSON
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
                        // Show context
                        const index = jsonString.indexOf(pattern);
                        const context = jsonString.substring(Math.max(0, index - 200), index + 200);
                        console.log(`🎯 JSON Context: "${context}"`);
                        return true;
                    }
                }
                
                console.log(`✅ JSON Script ${scriptCount}: No live indicators`);
                
            } catch (e) {
                console.log(`❌ JSON Script ${scriptCount}: Parse failed - ${e.message}`);
            }
        }
        
        console.log(`📊 Total JSON scripts checked: ${scriptCount}`);
        
        // Method 3: Search for EXACT live badge structure you provided
        console.log('\n🔎 Method 3: Checking for EXACT live badge structure...');
        
        // The exact HTML structure you provided
        const exactLiveBadgePatterns = [
            // Exact class pattern from your HTML
            /<div[^>]*class="[^"]*x6s0dn4[^"]*x78zum5[^"]*xl56j7k[^"]*x10l6tqk[^"]*xh8yej3[^"]*x1xtax4o[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*x972fbf[^"]*x10w94by[^"]*"[^>]*style="[^"]*border:\s*2px\s+solid\s+rgb\(255,\s*255,\s*255\)[^"]*"[^>]*>直播<\/span>[\s\S]*?<\/div>/i,
            
            // More flexible patterns
            /<div[^>]*x6s0dn4[^>]*>[\s\S]*?<span[^>]*x972fbf[^>]*x10w94by[^>]*>直播<\/span>[\s\S]*?<\/div>/i,
            /<span[^>]*x972fbf[^>]*x10w94by[^>]*[^>]*style="[^"]*border:\s*2px\s+solid[^"]*"[^>]*>直播<\/span>/i,
            
            // Core live badge pattern
            /<span[^>]*style="[^"]*border:\s*2px\s+solid\s+rgb\(255,\s*255,\s*255\)[^"]*border-radius:\s*4px[^"]*font-size:\s*12px[^"]*"[^>]*>直播<\/span>/i,
            
            // Simplified patterns
            /<span[^>]*x972fbf[^>]*>直播<\/span>/i,
            /<span[^>]*border:\s*2px\s+solid[^>]*>直播<\/span>/i,
            /<div[^>]*x6s0dn4[^>]*>[\s\S]{0,200}直播[\s\S]{0,200}<\/div>/i,
            
            // Alternative Chinese/English patterns
            /<span[^>]*style="[^"]*border:\s*2px\s+solid[^"]*"[^>]*>(?:直播|LIVE)<\/span>/i,
            /<div[^>]*><span[^>]*>(?:直播|LIVE)<\/span><\/div>/i
        ];
        
        console.log(`🔍 Checking ${exactLiveBadgePatterns.length} exact live badge patterns...`);
        
        for (let i = 0; i < exactLiveBadgePatterns.length; i++) {
            const pattern = exactLiveBadgePatterns[i];
            const matches = html.match(pattern);
            
            if (matches) {
                console.log(`🔴 EXACT LIVE BADGE DETECTED via pattern ${i + 1}!`);
                console.log(`🎯 Matched HTML: "${matches[0].substring(0, 200)}..."`);
                
                // Show full context
                const matchIndex = html.indexOf(matches[0]);
                const contextStart = Math.max(0, matchIndex - 300);
                const contextEnd = Math.min(html.length, matchIndex + 300);
                const context = html.substring(contextStart, contextEnd);
                console.log(`🎯 Full context: "${context}"`);
                return true;
            }
        }
        
        // Check for individual components of the live badge
        console.log('\n🔎 Method 3.1: Checking individual live badge components...');
        
        const hasX6s0dn4 = html.includes('x6s0dn4');
        const hasX972fbf = html.includes('x972fbf');
        const hasBorder2px = html.includes('border: 2px solid');
        const hasLiveText = html.includes('直播');
        const hasFontSize12 = html.includes('font-size: 12px');
        
        console.log(`📊 Live badge components check:`);
        console.log(`   - x6s0dn4 class: ${hasX6s0dn4 ? '✅' : '❌'}`);
        console.log(`   - x972fbf class: ${hasX972fbf ? '✅' : '❌'}`);
        console.log(`   - 2px border: ${hasBorder2px ? '✅' : '❌'}`);
        console.log(`   - "直播" text: ${hasLiveText ? '✅' : '❌'}`);
        console.log(`   - 12px font: ${hasFontSize12 ? '✅' : '❌'}`);
        
        if (hasLiveText) {
            console.log('🔍 Found "直播" text! Checking context...');
            const liveIndex = html.indexOf('直播');
            const contextStart = Math.max(0, liveIndex - 400);
            const contextEnd = Math.min(html.length, liveIndex + 400);
            const liveContext = html.substring(contextStart, contextEnd);
            console.log(`🎯 "直播" full context: "${liveContext}"`);
            
            // Check if it's in a span or div element
            if (liveContext.includes('<span') && liveContext.includes('</span>')) {
                console.log('🔴 LIVE DETECTED: "直播" found in span element!');
                return true;
            }
        }
        
        console.log('✅ Exact live badge patterns: No matches found');
        
        // Method 4: Deep search for live-related content (including all Chinese characters)
        console.log('\n🔎 Method 4: Deep searching for live content...');
        
        // Search for any red colored elements (live badges are usually red)
        const redColorPatterns = [
            /rgb\(255,\s*1,\s*105\)/i, // Instagram live red
            /rgb\(255,\s*48,\s*64\)/i,  // Another red variant
            /color:\s*red/i,
            /background:\s*red/i,
            /border:\s*[^;]*red/i
        ];
        
        console.log('🔍 Checking for red-colored elements...');
        for (const pattern of redColorPatterns) {
            const matches = html.match(pattern);
            if (matches) {
                console.log(`🔴 Found red color: ${matches[0]}`);
                const matchIndex = html.indexOf(matches[0]);
                const context = html.substring(Math.max(0, matchIndex - 300), matchIndex + 300);
                console.log(`🎯 Red element context: "${context}"`);
                
                // Check if context contains live-related text
                if (context.includes('直播') || context.includes('LIVE') || context.includes('live')) {
                    console.log('🔴 LIVE DETECTED via red colored element!');
                    return true;
                }
            }
        }
        
        // Search for story rings (live streams often appear as stories)
        console.log('🔍 Checking for story rings and live indicators...');
        const storyPatterns = [
            /story[^"]*live/i,
            /live[^"]*story/i,
            /canvas[^>]*>/i, // Stories often use canvas
            /gradient.*story/i,
            /ring.*live/i
        ];
        
        for (const pattern of storyPatterns) {
            const matches = html.match(pattern);
            if (matches) {
                console.log(`🔴 Found story/live pattern: ${matches[0]}`);
                const matchIndex = html.indexOf(matches[0]);
                const context = html.substring(Math.max(0, matchIndex - 200), matchIndex + 200);
                console.log(`🎯 Story context: "${context}"`);
                return true;
            }
        }
        
        // Search for ANY Chinese character near common Instagram classes
        console.log('🔍 Checking for Chinese characters near Instagram elements...');
        const instagramClassPatterns = [
            /x[0-9a-zA-Z]{6}[^"]*"[^>]*>[\s\S]*?[\u4e00-\u9fff]/,
            /class="[^"]*x[0-9a-zA-Z]+[^"]*"[^>]*>[\s\S]{0,100}[\u4e00-\u9fff]/
        ];
        
        for (const pattern of instagramClassPatterns) {
            const matches = html.match(pattern);
            if (matches && matches[0].includes('直播')) {
                console.log(`🔴 Found Chinese characters in Instagram element: ${matches[0]}`);
                return true;
            }
        }
        
        // Manual search for exact "直播" text
        console.log('🔍 Manual search for "直播"...');
        const liveIndex = html.indexOf('直播');
        if (liveIndex !== -1) {
            console.log('🔴 Found "直播" text!');
            const context = html.substring(Math.max(0, liveIndex - 200), liveIndex + 200);
            console.log(`🎯 "直播" context: "${context}"`);
            return true;
        }
        
        // Search for small text elements (live badges are often small)
        console.log('🔍 Checking for small text elements...');
        const smallTextPatterns = [
            /font-size:\s*[1-9]px[^>]*>[^<]*[\u4e00-\u9fff]/,
            /font-size:\s*1[0-2]px[^>]*>[^<]*[\u4e00-\u9fff]/
        ];
        
        for (const pattern of smallTextPatterns) {
            const matches = html.match(pattern);
            if (matches && matches[0].includes('直播')) {
                console.log(`🔴 Found small text with 直播: ${matches[0]}`);
                return true;
            }
        }
        
        console.log('✅ Deep search complete - no live indicators found');
        
        // Method 5: Check page title
        console.log('\n🔎 Method 5: Checking page title...');
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1] : 'No title';
        console.log(`📋 Page title: "${pageTitle}"`);
        
        if (pageTitle.toLowerCase().includes('live')) {
            console.log('🔴 LIVE detected in page title!');
            return true;
        }
        
        console.log('🔍 === COMPREHENSIVE DETECTION COMPLETE ===\n');
        console.log('❌ No live indicators found through any method');
        return false;
        
    } catch (error) {
        console.error('❌ Error checking live status:', error);
        return false;
    }
}

// Main monitoring loop
async function startMonitoring() {
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Comprehensive Detection)`);
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Comprehensive Detection Mode)`);
    
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
    
    // Monitor every 2 minutes for better debugging
    console.log('⏰ Starting monitoring loop (every 2 minutes)...');
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
    }, 2 * 60 * 1000); // Check every 2 minutes for detailed debugging
    
    // Keep alive heartbeat
    setInterval(() => {
        console.log(`💓 Bot heartbeat - monitoring @${TARGET_USERNAME} | Live: ${isLiveNow ? '🔴' : '⚫'} | Cookies: ${cookiesValid ? '✅' : '❌'} | ${new Date().toISOString()}`);
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