const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');

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
let userId = null;

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
        
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

// Get Instagram headers
function getHeaders() {
    return {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'X-IG-App-ID': '936619743392459',
        'X-IG-WWW-Claim': '0',
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}; mid=Zm9jdgALAAE8lHl_KpLHEI8hQDf2; ig_did=B8B8B8B8-B8B8-B8B8-B8B8-B8B8B8B8B8B8; fbm_124024574287414=base_domain=.instagram.com; datr=sNZtZr6tKpLHEI8hQDf2pQ4Q; ig_nrcb=1;`
    };
}

// Get user ID from username
async function getUserId() {
    if (userId) return userId;
    
    try {
        console.log('Getting user ID...');
        const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${TARGET_USERNAME}`;
        const response = await makeRequest(url, {
            method: 'GET',
            headers: getHeaders()
        });
        
        if (response.statusCode !== 200) {
            console.log(`Failed to get user profile: ${response.statusCode}`);
            return null;
        }
        
        const data = JSON.parse(response.data);
        userId = data.data?.user?.id;
        console.log('User ID obtained:', userId);
        return userId;
    } catch (error) {
        console.error('Error getting user ID:', error);
        return null;
    }
}

// Check live status using multiple methods
async function checkLiveStatus() {
    try {
        console.log('🔍 Checking live status...');
        
        // Method 1: Profile API
        console.log('Method 1: Checking profile API...');
        const profileUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${TARGET_USERNAME}`;
        const profileResponse = await makeRequest(profileUrl, {
            method: 'GET',
            headers: getHeaders()
        });
        
        if (profileResponse.statusCode === 401 || profileResponse.statusCode === 403) {
            console.log('❌ Authentication failed - cookies expired');
            cookiesValid = false;
            await sendDiscordMessage('🚨 Instagram cookies expired! Please update environment variables.');
            return false;
        }
        
        if (profileResponse.statusCode === 200) {
            try {
                const profileData = JSON.parse(profileResponse.data);
                const user = profileData.data?.user;
                
                if (user) {
                    // Check broadcast status
                    if (user.broadcast && user.broadcast.broadcast_status === 'active') {
                        console.log('✅ LIVE detected via profile API (broadcast active)');
                        return true;
                    }
                    
                    if (user.is_live === true) {
                        console.log('✅ LIVE detected via profile API (is_live flag)');
                        return true;
                    }
                    
                    // Get user ID for other methods
                    if (!userId) {
                        userId = user.id;
                    }
                }
            } catch (e) {
                console.log('Failed to parse profile data');
            }
        }
        
        // Method 2: Stories API (if user has stories)
        if (userId) {
            console.log('Method 2: Checking stories API...');
            try {
                const storiesUrl = `https://www.instagram.com/api/v1/feed/user/${userId}/story/`;
                const storiesResponse = await makeRequest(storiesUrl, {
                    method: 'GET',
                    headers: getHeaders()
                });
                
                if (storiesResponse.statusCode === 200) {
                    const storiesData = JSON.parse(storiesResponse.data);
                    const hasLiveStory = storiesData.items?.some(item => 
                        item.media_type === 4 || // Live video type
                        item.story_type === 'live' ||
                        (item.video_versions && item.caption?.text?.includes('LIVE'))
                    );
                    
                    if (hasLiveStory) {
                        console.log('✅ LIVE detected via stories API');
                        return true;
                    }
                }
            } catch (e) {
                console.log('Stories API check failed:', e.message);
            }
        }
        
        // Method 3: GraphQL API
        console.log('Method 3: Checking GraphQL API...');
        try {
            const variables = JSON.stringify({
                username: TARGET_USERNAME,
                fetch_mutual: false,
                fetch_suggested_users: false,
                fetch_followed_by_viewer: false
            });
            
            const graphqlUrl = `https://www.instagram.com/graphql/query/?query_hash=c9100bf9110dd6361671f113dd02e7d6&variables=${encodeURIComponent(variables)}`;
            const graphqlResponse = await makeRequest(graphqlUrl, {
                method: 'GET',
                headers: getHeaders()
            });
            
            if (graphqlResponse.statusCode === 200) {
                const graphqlData = JSON.parse(graphqlResponse.data);
                const user = graphqlData.data?.user;
                
                if (user && user.broadcast && user.broadcast.broadcast_status === 'active') {
                    console.log('✅ LIVE detected via GraphQL API');
                    return true;
                }
            }
        } catch (e) {
            console.log('GraphQL API check failed:', e.message);
        }
        
        console.log('❌ No live stream detected');
        return false;
        
    } catch (error) {
        console.error('Error checking live status:', error);
        
        if (error.message.includes('401') || error.message.includes('403')) {
            cookiesValid = false;
            await sendDiscordMessage('🚨 Instagram authentication failed! Please update cookies.');
        }
        
        return false;
    }
}

// Main monitoring loop
async function startMonitoring() {
    console.log(`🚀 Starting Instagram Live monitoring for @${TARGET_USERNAME} (HTTP API Version)`);
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Lightweight HTTP Version)`);
    
    // Get user ID first
    await getUserId();
    
    // Initial check
    console.log('Performing initial live status check...');
    try {
        const initialStatus = await checkLiveStatus();
        isLiveNow = initialStatus;
        if (initialStatus) {
            await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is currently LIVE on Instagram! https://www.instagram.com/${TARGET_USERNAME}/`);
        }
    } catch (error) {
        console.error('Initial check failed:', error);
    }
    
    // Monitor every minute
    console.log('⏰ Starting monitoring loop (every 60 seconds)...');
    setInterval(async () => {
        if (!cookiesValid) {
            console.log('⏭️ Skipping check - cookies invalid');
            return;
        }
        
        try {
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
            }
            
        } catch (error) {
            console.error('Error in monitoring loop:', error);
        }
    }, 60 * 1000); // Check every minute
    
    // Keep alive heartbeat
    setInterval(() => {
        console.log(`💓 Bot heartbeat - monitoring @${TARGET_USERNAME} | Live: ${isLiveNow ? '🔴' : '⚫'} | Cookies: ${cookiesValid ? '✅' : '❌'}`);
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