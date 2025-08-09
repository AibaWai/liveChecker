const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const TARGET_USERNAME = process.env.TARGET_USERNAME;
const IG_SESSION_ID = process.env.IG_SESSION_ID;
const IG_CSRF_TOKEN = process.env.IG_CSRF_TOKEN;
const IG_DS_USER_ID = process.env.IG_DS_USER_ID;

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let sessionData = {
    userAgent: 'Instagram 302.0.0.23.113 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 492113219)',
    cookies: `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`,
    deviceId: 'android-' + Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    uuid: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    })
};

let isLiveNow = false;
let targetUserId = null;

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = [];
            
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(data);
                resolve({ 
                    statusCode: res.statusCode, 
                    headers: res.headers,
                    data: buffer.toString('utf8')
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

async function sendDiscordMessage(message) {
    try {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        if (message.length > 1900) {
            message = message.substring(0, 1900) + '...(truncated)';
        }
        await channel.send(message);
    } catch (error) {
        console.error('Failed to send Discord message:', error);
    }
}

// 獲取用戶 ID
async function getUserId(username) {
    if (targetUserId) return targetUserId;
    
    console.log(`🔍 Getting user ID for @${username}...`);
    
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        
        const response = await makeRequest(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
            method: 'GET',
            headers: {
                'User-Agent': sessionData.userAgent,
                'Accept': 'application/json',
                'Cookie': sessionData.cookies,
                'X-IG-App-Locale': 'en_US',
                'X-IG-Device-Locale': 'en_US',
                'X-IG-Mapped-Locale': 'en_US',
                'X-Pigeon-Session-Id': sessionData.uuid,
                'X-Pigeon-Rawclienttime': timestamp,
                'X-IG-Bandwidth-Speed-KBPS': '-1.000',
                'X-IG-Bandwidth-TotalBytes-B': '0',
                'X-IG-Bandwidth-TotalTime-MS': '0',
                'X-IG-Connection-Type': 'WIFI',
                'X-IG-Capabilities': '3brTvx8=',
                'X-IG-App-ID': '567067343352427',
                'X-IG-Device-ID': sessionData.deviceId,
                'X-IG-Android-ID': sessionData.deviceId,
                'Host': 'i.instagram.com'
            }
        });
        
        if (response.statusCode === 200) {
            const data = JSON.parse(response.data);
            if (data.data?.user?.id) {
                targetUserId = data.data.user.id;
                console.log(`✅ Found user ID: ${targetUserId}`);
                return targetUserId;
            }
        }
        
        console.log(`❌ Failed to get user ID: ${response.statusCode}`);
        return null;
        
    } catch (error) {
        console.error('❌ Error getting user ID:', error);
        return null;
    }
}

// 檢查用戶的 Story Feed（包含直播信息）
async function checkUserStoryFeed(userId) {
    console.log(`📺 Checking story feed for user ID: ${userId}...`);
    
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        
        const response = await makeRequest(`https://i.instagram.com/api/v1/feed/user/${userId}/story/`, {
            method: 'GET',
            headers: {
                'User-Agent': sessionData.userAgent,
                'Accept': 'application/json',
                'Cookie': sessionData.cookies,
                'X-IG-App-Locale': 'en_US',
                'X-IG-Device-Locale': 'en_US',
                'X-IG-Mapped-Locale': 'en_US',
                'X-Pigeon-Session-Id': sessionData.uuid,
                'X-Pigeon-Rawclienttime': timestamp,
                'X-IG-Connection-Type': 'WIFI',
                'X-IG-Capabilities': '3brTvx8=',
                'X-IG-App-ID': '567067343352427',
                'X-IG-Device-ID': sessionData.deviceId,
                'Host': 'i.instagram.com'
            }
        });
        
        console.log(`📊 Story feed response: ${response.statusCode}`);
        
        if (response.statusCode === 200) {
            const data = JSON.parse(response.data);
            
            // 檢查是否有 broadcast 信息
            if (data.broadcast) {
                console.log('🔴 BROADCAST FOUND in story feed!');
                console.log(`📊 Broadcast data: ${JSON.stringify(data.broadcast, null, 2)}`);
                return {
                    isLive: true,
                    broadcastData: data.broadcast,
                    source: 'story_feed'
                };
            }
            
            // 檢查 reel 中的直播
            if (data.reel && data.reel.items) {
                for (const item of data.reel.items) {
                    if (item.media_type === 4) { // Live video
                        console.log('🔴 LIVE VIDEO FOUND in reel!');
                        return {
                            isLive: true,
                            broadcastData: item,
                            source: 'reel_item'
                        };
                    }
                }
            }
            
            console.log('⚫ No live broadcast found in story feed');
            return { isLive: false, source: 'story_feed' };
        }
        
        console.log(`❌ Story feed request failed: ${response.statusCode}`);
        return { isLive: false, source: 'error' };
        
    } catch (error) {
        console.error('❌ Error checking story feed:', error);
        return { isLive: false, source: 'error' };
    }
}

// 檢查直播狀態的主要 API
async function checkUserBroadcast(userId) {
    console.log(`🎥 Checking user broadcast for user ID: ${userId}...`);
    
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        
        // 嘗試直接的 broadcast API
        const response = await makeRequest(`https://i.instagram.com/api/v1/live/${userId}/info/`, {
            method: 'GET',
            headers: {
                'User-Agent': sessionData.userAgent,
                'Accept': 'application/json',
                'Cookie': sessionData.cookies,
                'X-IG-App-Locale': 'en_US',
                'X-IG-Device-Locale': 'en_US',
                'X-IG-Mapped-Locale': 'en_US',
                'X-Pigeon-Session-Id': sessionData.uuid,
                'X-Pigeon-Rawclienttime': timestamp,
                'X-IG-Connection-Type': 'WIFI',
                'X-IG-Capabilities': '3brTvx8=',
                'X-IG-App-ID': '567067343352427',
                'X-IG-Device-ID': sessionData.deviceId,
                'Host': 'i.instagram.com'
            }
        });
        
        console.log(`📊 Broadcast API response: ${response.statusCode}`);
        
        if (response.statusCode === 200) {
            const data = JSON.parse(response.data);
            
            if (data.broadcast_status === 'active') {
                console.log('🔴 ACTIVE BROADCAST FOUND!');
                console.log(`📊 Broadcast info: ${JSON.stringify(data, null, 2)}`);
                return {
                    isLive: true,
                    broadcastData: data,
                    source: 'broadcast_api'
                };
            }
            
            console.log(`⚫ Broadcast status: ${data.broadcast_status || 'inactive'}`);
            return { isLive: false, source: 'broadcast_api' };
        }
        
        console.log(`❌ Broadcast API failed: ${response.statusCode}`);
        return { isLive: false, source: 'error' };
        
    } catch (error) {
        console.error('❌ Error checking broadcast API:', error);
        return { isLive: false, source: 'error' };
    }
}

// 組合檢測方法
async function checkInstagramLivePrivateAPI() {
    console.log(`\n🔍 Checking @${TARGET_USERNAME} using Private API methods...`);
    
    try {
        // 1. 獲取用戶 ID
        const userId = await getUserId(TARGET_USERNAME);
        if (!userId) {
            await sendDiscordMessage('❌ Failed to get user ID');
            return false;
        }
        
        // 2. 檢查多個 API 端點
        const results = {};
        
        // 方法 1: Story Feed
        results.storyFeed = await checkUserStoryFeed(userId);
        
        // 方法 2: Broadcast API
        results.broadcast = await checkUserBroadcast(userId);
        
        // 3. 分析結果
        console.log('\n📊 === Private API Results ===');
        Object.entries(results).forEach(([method, result]) => {
            console.log(`   ${method}: ${result.isLive ? '🔴 LIVE' : '⚫ Offline'} (${result.source})`);
        });
        
        // 創建報告
        const report = `🔍 **Private API Check Results:**

**User ID:** ${userId}

**Story Feed:** ${results.storyFeed.isLive ? '🔴 LIVE' : '⚫ Offline'}
**Broadcast API:** ${results.broadcast.isLive ? '🔴 LIVE' : '⚫ Offline'}

**Final Decision:** ${(results.storyFeed.isLive || results.broadcast.isLive) ? '🔴 LIVE DETECTED' : '⚫ NOT LIVE'}`;

        await sendDiscordMessage(report);
        
        // 如果找到直播，顯示詳細信息
        if (results.storyFeed.isLive && results.storyFeed.broadcastData) {
            const broadcastInfo = results.storyFeed.broadcastData;
            const details = `📺 **Live Broadcast Details:**
ID: ${broadcastInfo.id || 'N/A'}
Status: ${broadcastInfo.broadcast_status || 'N/A'}
Viewer Count: ${broadcastInfo.viewer_count || 'N/A'}
Published: ${broadcastInfo.published_time || 'N/A'}`;
            
            await sendDiscordMessage(details);
        }
        
        return results.storyFeed.isLive || results.broadcast.isLive;
        
    } catch (error) {
        console.error('❌ Error in private API check:', error);
        await sendDiscordMessage(`❌ Error: ${error.message}`);
        return false;
    }
}

// Discord 命令處理
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    
    if (content === '!private') {
        await message.reply('🔍 Checking with Private API methods...');
        const isLive = await checkInstagramLivePrivateAPI();
        const status = isLive ? '🔴 LIVE DETECTED' : '⚫ Not Live';
        await message.reply(`📊 **Private API Result:** ${status}`);
    }
    
    if (content === '!status') {
        const status = isLiveNow ? '🔴 LIVE' : '⚫ Offline';
        await message.reply(`📊 **Status**\nTarget: @${TARGET_USERNAME}\nCurrent: ${status}\nUser ID: ${targetUserId || 'Not fetched'}\n\n💡 Use \`!private\` for private API check`);
    }
    
    if (content === '!monitor') {
        await message.reply('🚀 Starting private API monitoring...');
        startPrivateAPIMonitoring();
    }
    
    if (content === '!help') {
        await message.reply(`🔍 **Private API Live Checker**\n\n\`!private\` - Check using private API methods\n\`!monitor\` - Start continuous monitoring\n\`!status\` - Check current status\n\`!help\` - Show this help`);
    }
});

// 私有 API 持續監控
function startPrivateAPIMonitoring() {
    console.log('🚀 Starting private API monitoring...');
    
    setInterval(async () => {
        try {
            const currentlyLive = await checkInstagramLivePrivateAPI();
            
            if (currentlyLive && !isLiveNow) {
                isLiveNow = true;
                console.log('🔴 STATUS CHANGE: User went LIVE!');
                await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is now LIVE on Instagram! 🎥\n\nhttps://www.instagram.com/${TARGET_USERNAME}/`);
            } else if (!currentlyLive && isLiveNow) {
                isLiveNow = false;
                console.log('⚫ STATUS CHANGE: User went offline');
                await sendDiscordMessage(`⚫ @${TARGET_USERNAME} has ended their Instagram Live stream.`);
            } else {
                console.log(`📊 Status unchanged: ${currentlyLive ? '🔴 LIVE' : '⚫ Offline'}`);
            }
            
        } catch (error) {
            console.error('❌ Error in monitoring:', error);
        }
    }, 2 * 60 * 1000); // Check every 2 minutes
}

client.once('ready', () => {
    console.log(`✅ Private API checker ready as ${client.user.tag}!`);
    sendDiscordMessage(`🔍 **Instagram Private API Checker Ready**\nTarget: @${TARGET_USERNAME}\n\n💡 Use \`!private\` to check with private API methods\n💡 Use \`!monitor\` to start continuous monitoring`);
});

client.login(DISCORD_TOKEN);