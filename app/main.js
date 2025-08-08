const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const TARGET_USERNAME = process.env.TARGET_USERNAME;

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
    
    if (!TARGET_USERNAME || !DISCORD_CHANNEL_ID) {
        console.error('Missing required environment variables!');
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

// Make HTTP request
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({ 
                    statusCode: res.statusCode, 
                    headers: res.headers, 
                    data: data 
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

// Check live status with extensive debugging
async function checkLiveStatus() {
    try {
        console.log('🔍 Checking Instagram page for live indicators...');
        
        const url = `https://www.instagram.com/${TARGET_USERNAME}/`;
        const response = await makeRequest(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            }
        });
        
        console.log(`📊 Response status: ${response.statusCode}`);
        console.log(`📊 Content length: ${response.data.length} characters`);
        
        if (response.statusCode !== 200) {
            console.log(`❌ Instagram page returned status: ${response.statusCode}`);
            return false;
        }
        
        const html = response.data;
        
        // Debug: Show first 1000 characters of HTML
        console.log('📄 HTML Preview (first 1000 chars):');
        console.log(html.substring(0, 1000));
        console.log('📄 End of HTML preview');
        
        // Expanded live indicators
        const liveIndicators = [
            // Broadcast status indicators
            'broadcast_status":"active"',
            '"broadcast_status":"active"',
            'broadcastStatus":"active"',
            
            // Live flags
            '"is_live":true',
            '"isLive":true',
            'is_live":true',
            'isLive":true',
            
            // Live UI elements
            'ig-live-badge',
            'live-video-indicator',
            'live-badge',
            'LIVE</span>',
            'Live</span>',
            'aria-label="Live"',
            'aria-label="LIVE"',
            'class="live"',
            
            // Story live indicators
            'story_type":"live"',
            'storyType":"live"',
            '"story_type":"live"',
            '"storyType":"live"',
            
            // GraphQL types
            '"__typename":"GraphLiveVideo"',
            '__typename":"GraphLiveVideo"',
            'GraphLiveVideo',
            
            // Media types
            'media_type":4',
            '"media_type":4',
            'mediaType":4',
            '"mediaType":4',
            
            // Additional patterns
            'broadcast":{"',
            '"broadcast":{',
            'live_video_id',
            'liveVideoId',
            'dash_live_encodings',
            'broadcast_owner',
            'viewer_count'
        ];
        
        console.log('🔎 Checking for live indicators...');
        let foundIndicators = [];
        
        for (const indicator of liveIndicators) {
            if (html.includes(indicator)) {
                foundIndicators.push(indicator);
                console.log(`✅ Found indicator: "${indicator}"`);
            }
        }
        
        if (foundIndicators.length > 0) {
            console.log(`🎉 LIVE DETECTED! Found ${foundIndicators.length} indicators:`, foundIndicators);
            return true;
        }
        
        // Check for window._sharedData
        console.log('🔍 Checking window._sharedData...');
        const sharedDataMatches = html.match(/window\._sharedData\s*=\s*({.*?});/s);
        if (sharedDataMatches) {
            console.log('📦 Found _sharedData, checking for live status...');
            try {
                const sharedData = JSON.parse(sharedDataMatches[1]);
                console.log('📦 Shared data keys:', Object.keys(sharedData));
                
                const user = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user;
                if (user) {
                    console.log('👤 User data found in shared data');
                    if (user.broadcast) {
                        console.log('📡 Broadcast data:', JSON.stringify(user.broadcast, null, 2));
                        if (user.broadcast.broadcast_status === 'active') {
                            console.log('✅ LIVE detected via shared data broadcast!');
                            return true;
                        }
                    }
                    if (user.is_live) {
                        console.log('✅ LIVE detected via shared data is_live flag!');
                        return true;
                    }
                } else {
                    console.log('❌ No user data in shared data');
                }
            } catch (e) {
                console.log('❌ Could not parse shared data:', e.message);
            }
        } else {
            console.log('❌ No _sharedData found');
        }
        
        // Check for JSON script tags
        console.log('🔍 Checking JSON script tags...');
        const scriptMatches = html.match(/<script type="application\/json"[^>]*data-content-len="[^"]*"[^>]*>([^<]*)<\/script>/g);
        if (scriptMatches && scriptMatches.length > 0) {
            console.log(`📦 Found ${scriptMatches.length} JSON script tags`);
            
            for (let i = 0; i < scriptMatches.length; i++) {
                const scriptMatch = scriptMatches[i];
                const jsonMatch = scriptMatch.match(/>([^<]*)</);
                if (jsonMatch) {
                    try {
                        const jsonData = JSON.parse(jsonMatch[1]);
                        const jsonString = JSON.stringify(jsonData);
                        
                        console.log(`📄 Script ${i + 1} length: ${jsonString.length} chars`);
                        
                        if (jsonString.includes('broadcast_status":"active"') || 
                            jsonString.includes('"is_live":true') ||
                            jsonString.includes('GraphLiveVideo') ||
                            jsonString.includes('media_type":4')) {
                            console.log(`✅ LIVE detected in JSON script ${i + 1}!`);
                            console.log('🎯 Relevant JSON snippet:', jsonString.substring(jsonString.indexOf('broadcast') - 100, jsonString.indexOf('broadcast') + 200));
                            return true;
                        }
                    } catch (e) {
                        console.log(`❌ Could not parse JSON script ${i + 1}:`, e.message);
                    }
                }
            }
        } else {
            console.log('❌ No JSON script tags found');
        }
        
        // Check for any "live" related text
        console.log('🔍 Searching for any "live" mentions...');
        const liveRegex = /live/gi;
        const liveMatches = html.match(liveRegex);
        if (liveMatches) {
            console.log(`📊 Found ${liveMatches.length} mentions of "live" in the page`);
            // Show context around first few matches
            const liveIndices = [];
            let match;
            const regex = /live/gi;
            let count = 0;
            while ((match = regex.exec(html)) !== null && count < 5) {
                liveIndices.push(match.index);
                const start = Math.max(0, match.index - 50);
                const end = Math.min(html.length, match.index + 50);
                console.log(`📄 Live context ${count + 1}: "${html.substring(start, end)}"`);
                count++;
            }
        } else {
            console.log('❌ No mentions of "live" found in the page');
        }
        
        console.log('❌ No live stream detected after extensive search');
        return false;
        
    } catch (error) {
        console.error('❌ Error checking live status:', error);
        return false;
    }
}

// Main monitoring loop
async function startMonitoring() {
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (Debug Version)`);
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Debug Version - Extensive Logging)`);
    
    // Initial check
    console.log('🔎 Performing initial live status check...');
    try {
        const initialStatus = await checkLiveStatus();
        isLiveNow = initialStatus;
        if (initialStatus) {
            await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is currently LIVE on Instagram! https://www.instagram.com/${TARGET_USERNAME}/`);
        } else {
            console.log('✅ Initial check complete - not currently live (according to our detection)');
        }
    } catch (error) {
        console.error('❌ Initial check failed:', error);
    }
    
    // Monitor every 2 minutes for testing (more frequent)
    console.log('⏰ Starting monitoring loop (every 2 minutes for debugging)...');
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
    }, 2 * 60 * 1000); // Check every 2 minutes for debugging
    
    // Keep alive heartbeat
    setInterval(() => {
        console.log(`💓 Bot heartbeat - monitoring @${TARGET_USERNAME} | Status: ${isLiveNow ? '🔴 LIVE' : '⚫ Offline'} | Time: ${new Date().toISOString()}`);
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