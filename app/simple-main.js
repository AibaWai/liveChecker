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
    
    if (!TARGET_USERNAME) {
        console.error('TARGET_USERNAME is not set!');
        return;
    }
    
    if (!DISCORD_CHANNEL_ID) {
        console.error('DISCORD_CHANNEL_ID is not set!');
        return;
    }
    
    startMonitoring();
});

// Send Discord message
async function sendDiscordMessage(message) {
    try {
        if (!DISCORD_CHANNEL_ID) {
            console.error('DISCORD_CHANNEL_ID not set');
            return;
        }
        
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        if (!channel) {
            console.error('Channel not found or bot has no access');
            return;
        }
        
        await channel.send(message);
        console.log('Discord message sent:', message);
    } catch (error) {
        console.error('Failed to send Discord message:', error);
        if (error.code === 50001) {
            console.error('Bot is missing access to the channel. Please check:');
            console.error('1. Bot is invited to the server');
            console.error('2. Bot has "View Channel" and "Send Messages" permissions');
            console.error('3. Channel ID is correct');
        }
    }
}

// Make HTTP request to Instagram
function makeRequest(url, options) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, headers: res.headers, data });
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

// Check if user is live using Instagram's mobile API
async function checkLiveStatus() {
    try {
        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Instagram 76.0.0.15.395 Android (24/7.0; 640dpi; 1440x2560; samsung; SM-G930F; herolte; samsungexynos8890; en_US; 138226743)',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'X-IG-App-ID': '936619743392459',
                'X-IG-WWW-Claim': '0',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID};`
            }
        };

        // Try to get user info first
        const userUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${TARGET_USERNAME}`;
        const userResponse = await makeRequest(userUrl, options);
        
        if (userResponse.statusCode === 401 || userResponse.statusCode === 403) {
            console.log('Instagram authentication failed - cookies may be expired');
            cookiesValid = false;
            await sendDiscordMessage('🚨 Instagram cookies expired! Please update the environment variables.');
            return false;
        }
        
        if (userResponse.statusCode !== 200) {
            console.log(`Instagram API returned status: ${userResponse.statusCode}`);
            return false;
        }

        let userData;
        try {
            userData = JSON.parse(userResponse.data);
        } catch (e) {
            console.log('Failed to parse user data response');
            return false;
        }

        const user = userData.data?.user;
        if (!user) {
            console.log('User data not found in response');
            return false;
        }

        // Check if user has an active live broadcast
        const isCurrentlyLive = user.broadcast?.broadcast_status === 'active' || 
                               user.is_live === true ||
                               user.broadcast?.id !== null;

        // Alternative check using stories
        if (!isCurrentlyLive && user.has_public_story) {
            try {
                const storiesUrl = `https://www.instagram.com/api/v1/feed/user/${user.id}/story/`;
                const storiesResponse = await makeRequest(storiesUrl, options);
                
                if (storiesResponse.statusCode === 200) {
                    const storiesData = JSON.parse(storiesResponse.data);
                    const hasLiveStory = storiesData.items?.some(item => 
                        item.media_type === 4 || // Live video type
                        item.story_type === 'live'
                    );
                    
                    if (hasLiveStory) {
                        console.log(`Live status check: LIVE (detected in stories)`);
                        return true;
                    }
                }
            } catch (e) {
                console.log('Failed to check stories for live content');
            }
        }

        console.log(`Live status check: ${isCurrentlyLive ? 'LIVE' : 'NOT LIVE'}`);
        return isCurrentlyLive;
        
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
    console.log(`Starting Instagram Live monitoring for @${TARGET_USERNAME}`);
    await sendDiscordMessage(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (HTTP Version)`);
    
    // Monitor every minute
    setInterval(async () => {
        if (!cookiesValid) {
            console.log('Cookies invalid, skipping check');
            return;
        }
        
        try {
            const currentlyLive = await checkLiveStatus();
            
            // Send notification when going live
            if (currentlyLive && !isLiveNow) {
                isLiveNow = true;
                await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is now LIVE on Instagram! https://www.instagram.com/${TARGET_USERNAME}/`);
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