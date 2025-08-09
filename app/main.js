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

// 安全配置
const SAFETY_CONFIG = {
    minInterval: 90,      // 最小間隔 90 秒
    maxInterval: 180,     // 最大間隔 180 秒
    maxConsecutiveErrors: 3,  // 最大連續錯誤次數
    backoffMultiplier: 2,     // 退避倍數
    maxBackoffInterval: 600,  // 最大退避間隔 10 分鐘
    rateLimitCooldown: 900,   // 被限制後冷卻 15 分鐘
};

let state = {
    isLiveNow: false,
    targetUserId: null,
    isMonitoring: false,
    consecutiveErrors: 0,
    currentInterval: SAFETY_CONFIG.minInterval,
    lastRequestTime: 0,
    accountStatus: 'unknown', // 'active', 'suspended', 'invalid'
    monitoringStartTime: Date.now(),
    totalRequests: 0,
    successfulRequests: 0,
    lastSuccessTime: Date.now()
};

// 隨機 User Agents 池
const USER_AGENTS = [
    'Instagram 302.0.0.23.113 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 492113219)',
    'Instagram 299.0.0.51.109 Android (32/12; 440dpi; 1080x2340; OnePlus; CPH2423; OP515FL1; qcom; en_US; 486741830)',
    'Instagram 301.0.0.29.124 Android (33/13; 480dpi; 1080x2400; Xiaomi; 2201116SG; lisa; qcom; en_US; 491671575)',
    'Instagram 300.1.0.23.111 Android (31/12; 420dpi; 1080x2400; google; Pixel 6; oriole; google; en_US; 489553847)'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomInterval() {
    return Math.floor(Math.random() * (SAFETY_CONFIG.maxInterval - SAFETY_CONFIG.minInterval + 1)) + SAFETY_CONFIG.minInterval;
}

function generateDeviceData() {
    return {
        deviceId: 'android-' + Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        uuid: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        }),
        userAgent: getRandomUserAgent()
    };
}

let sessionData = {
    ...generateDeviceData(),
    cookies: `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`,
};

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        // 記錄請求
        state.totalRequests++;
        state.lastRequestTime = Date.now();
        
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

// 檢查帳號狀態
function analyzeAccountStatus(statusCode, responseData) {
    if (statusCode === 401) {
        return 'invalid_credentials';
    } else if (statusCode === 403) {
        return 'suspended_or_blocked';
    } else if (statusCode === 429) {
        return 'rate_limited';
    } else if (statusCode >= 500) {
        return 'server_error';
    } else if (statusCode === 200) {
        try {
            const data = JSON.parse(responseData);
            if (data.message && data.message.includes('challenge')) {
                return 'challenge_required';
            }
            if (data.status === 'ok') {
                return 'active';
            }
        } catch (e) {
            // 解析失敗但狀態碼 200，可能還是有效的
            return 'active';
        }
    }
    return 'unknown';
}

// 獲取用戶 ID
async function getUserId(username) {
    if (state.targetUserId) return state.targetUserId;
    
    console.log(`🔍 Getting user ID for @${username}...`);
    
    try {
        // 隨機延遲 1-3 秒
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        
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
                'X-IG-Bandwidth-Speed-KBPS': String(Math.floor(Math.random() * 5000) + 1000),
                'X-IG-Bandwidth-TotalBytes-B': String(Math.floor(Math.random() * 1000000)),
                'X-IG-Bandwidth-TotalTime-MS': String(Math.floor(Math.random() * 5000) + 1000),
                'X-IG-Connection-Type': 'WIFI',
                'X-IG-Capabilities': '3brTvx8=',
                'X-IG-App-ID': '567067343352427',
                'X-IG-Device-ID': sessionData.deviceId,
                'X-IG-Android-ID': sessionData.deviceId,
                'Host': 'i.instagram.com'
            }
        });
        
        // 分析帳號狀態
        state.accountStatus = analyzeAccountStatus(response.statusCode, response.data);
        
        if (response.statusCode === 200) {
            const data = JSON.parse(response.data);
            if (data.data?.user?.id) {
                state.targetUserId = data.data.user.id;
                state.successfulRequests++;
                state.lastSuccessTime = Date.now();
                state.consecutiveErrors = 0;
                console.log(`✅ Found user ID: ${state.targetUserId}`);
                return state.targetUserId;
            }
        }
        
        console.log(`❌ Failed to get user ID: ${response.statusCode} (${state.accountStatus})`);
        return null;
        
    } catch (error) {
        console.error('❌ Error getting user ID:', error);
        state.consecutiveErrors++;
        return null;
    }
}

// 檢查用戶的 Story Feed
async function checkUserStoryFeed(userId) {
    console.log(`📺 Checking story feed for user ID: ${userId}...`);
    
    try {
        // 隨機延遲
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1500));
        
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
        
        // 分析帳號狀態
        state.accountStatus = analyzeAccountStatus(response.statusCode, response.data);
        
        if (response.statusCode === 200) {
            const data = JSON.parse(response.data);
            state.successfulRequests++;
            state.lastSuccessTime = Date.now();
            state.consecutiveErrors = 0;
            
            // 檢查是否有 broadcast 信息
            if (data.broadcast) {
                console.log('🔴 BROADCAST FOUND in story feed!');
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
        
        console.log(`❌ Story feed request failed: ${response.statusCode} (${state.accountStatus})`);
        state.consecutiveErrors++;
        
        // 處理特殊錯誤
        if (response.statusCode === 429) {
            await sendDiscordMessage(`⚠️ **Rate Limited!** Cooling down for ${SAFETY_CONFIG.rateLimitCooldown / 60} minutes...`);
        }
        
        return { isLive: false, source: 'error', statusCode: response.statusCode };
        
    } catch (error) {
        console.error('❌ Error checking story feed:', error);
        state.consecutiveErrors++;
        return { isLive: false, source: 'error' };
    }
}

// 安全檢查函數
async function performSafetyCheck() {
    const timeSinceLastSuccess = Date.now() - state.lastSuccessTime;
    const timeSinceStart = Date.now() - state.monitoringStartTime;
    
    // 檢查帳號是否可能被封
    if (state.accountStatus === 'invalid_credentials') {
        await sendDiscordMessage(`🚨 **Account Alert!** 
❌ **Invalid Credentials** - Session may have expired
Please update your Instagram session cookies.`);
        return false;
    }
    
    if (state.accountStatus === 'suspended_or_blocked') {
        await sendDiscordMessage(`🚨 **Account Alert!** 
🔒 **Account Suspended/Blocked** 
Your Instagram account may have been flagged. Consider:
- Using a different account
- Waiting 24-48 hours before retrying
- Reducing monitoring frequency`);
        return false;
    }
    
    if (state.accountStatus === 'challenge_required') {
        await sendDiscordMessage(`🚨 **Account Alert!** 
🔐 **Challenge Required** 
Instagram requires verification. Please:
1. Login to Instagram manually
2. Complete any required challenges
3. Update session cookies`);
        return false;
    }
    
    // 檢查是否太久沒有成功請求
    if (timeSinceLastSuccess > 30 * 60 * 1000) { // 30 分鐘
        await sendDiscordMessage(`⚠️ **Connection Alert!**
📡 No successful requests for ${Math.round(timeSinceLastSuccess / 60000)} minutes
Account Status: ${state.accountStatus}
This might indicate:
- Session cookies expired
- Account temporarily restricted
- Network issues`);
    }
    
    // 檢查錯誤率
    const errorRate = state.totalRequests > 0 ? (state.totalRequests - state.successfulRequests) / state.totalRequests : 0;
    if (state.totalRequests > 10 && errorRate > 0.5) {
        await sendDiscordMessage(`⚠️ **High Error Rate Alert!**
📊 Error Rate: ${Math.round(errorRate * 100)}%
Total Requests: ${state.totalRequests}
Successful: ${state.successfulRequests}
Consider reducing monitoring frequency.`);
    }
    
    return true;
}

// 動態調整間隔
function adjustInterval() {
    if (state.consecutiveErrors >= SAFETY_CONFIG.maxConsecutiveErrors) {
        // 使用指數退避
        state.currentInterval = Math.min(
            state.currentInterval * SAFETY_CONFIG.backoffMultiplier,
            SAFETY_CONFIG.maxBackoffInterval
        );
        console.log(`⚠️ Increasing interval to ${state.currentInterval}s due to consecutive errors`);
    } else if (state.consecutiveErrors === 0 && state.currentInterval > SAFETY_CONFIG.minInterval) {
        // 逐漸恢復正常間隔
        state.currentInterval = Math.max(
            state.currentInterval * 0.8,
            SAFETY_CONFIG.minInterval
        );
        console.log(`✅ Decreasing interval to ${state.currentInterval}s`);
    }
    
    // 添加隨機性
    const randomizedInterval = state.currentInterval + Math.random() * 30 - 15; // ±15秒隨機
    return Math.max(randomizedInterval, SAFETY_CONFIG.minInterval);
}

// 主要監控函數
async function checkInstagramLiveSafely() {
    console.log(`\n🔍 Safe check for @${TARGET_USERNAME}...`);
    
    try {
        // 安全檢查
        const safetyOk = await performSafetyCheck();
        if (!safetyOk) {
            return false;
        }
        
        // 如果被限制，等待冷卻時間
        if (state.accountStatus === 'rate_limited') {
            console.log('⏳ In rate limit cooldown, skipping check...');
            return false;
        }
        
        // 獲取用戶 ID
        const userId = await getUserId(TARGET_USERNAME);
        if (!userId) {
            return false;
        }
        
        // 檢查直播狀態
        const result = await checkUserStoryFeed(userId);
        
        console.log(`📊 Check result: ${result.isLive ? '🔴 LIVE' : '⚫ Offline'} (${result.source})`);
        return result.isLive;
        
    } catch (error) {
        console.error('❌ Error in safe check:', error);
        state.consecutiveErrors++;
        return false;
    }
}

// Discord 命令處理
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    
    if (content === '!start' || content === '!monitor') {
        if (state.isMonitoring) {
            await message.reply('⚠️ Monitoring is already running!');
            return;
        }
        
        await message.reply('🚀 Starting safe 24/7 monitoring...');
        startSafeMonitoring();
    }
    
    if (content === '!stop') {
        state.isMonitoring = false;
        await message.reply('⏹️ Monitoring stopped.');
    }
    
    if (content === '!status') {
        const runtime = Math.round((Date.now() - state.monitoringStartTime) / 60000);
        const successRate = state.totalRequests > 0 ? Math.round((state.successfulRequests / state.totalRequests) * 100) : 0;
        const timeSinceLastSuccess = Math.round((Date.now() - state.lastSuccessTime) / 60000);
        
        const statusMsg = `📊 **Monitoring Status**

**Target:** @${TARGET_USERNAME}
**Current Status:** ${state.isLiveNow ? '🔴 LIVE' : '⚫ Offline'}
**Monitoring:** ${state.isMonitoring ? '✅ Active' : '❌ Stopped'}
**Account Status:** ${state.accountStatus}

**Statistics:**
⏱️ Runtime: ${runtime} minutes
📡 Total Requests: ${state.totalRequests}
✅ Success Rate: ${successRate}%
🔄 Current Interval: ${Math.round(state.currentInterval)}s
⚠️ Consecutive Errors: ${state.consecutiveErrors}
🕐 Last Success: ${timeSinceLastSuccess} minutes ago

**User ID:** ${state.targetUserId || 'Not fetched'}`;

        await message.reply(statusMsg);
    }
    
    if (content === '!check') {
        await message.reply('🔍 Performing safe manual check...');
        const isLive = await checkInstagramLiveSafely();
        const status = isLive ? '🔴 LIVE DETECTED' : '⚫ Not Live';
        await message.reply(`📊 **Manual Check Result:** ${status}\nAccount Status: ${state.accountStatus}`);
    }
    
    if (content === '!refresh') {
        // 重新生成設備資料和 User Agent
        const newDeviceData = generateDeviceData();
        sessionData = {
            ...newDeviceData,
            cookies: sessionData.cookies
        };
        state.targetUserId = null; // 重新獲取
        await message.reply('🔄 Device data refreshed with new User-Agent and device ID');
    }
    
    if (content === '!help') {
        await message.reply(`🔍 **Safe Instagram Live Monitor**

**Commands:**
\`!start\` / \`!monitor\` - Start 24/7 monitoring
\`!stop\` - Stop monitoring
\`!status\` - Show detailed status
\`!check\` - Manual safety check
\`!refresh\` - Refresh device data
\`!help\` - Show this help

**Safety Features:**
🔒 Random intervals (90-180s)
🛡️ Account status monitoring
⚠️ Auto cooldown on errors
🔄 Device rotation
📊 Error rate tracking`);
    }
});

// 安全的 24/7 監控
function startSafeMonitoring() {
    if (state.isMonitoring) {
        console.log('⚠️ Monitoring already running');
        return;
    }
    
    state.isMonitoring = true;
    state.monitoringStartTime = Date.now();
    console.log('🚀 Starting safe 24/7 monitoring...');
    
    async function monitorLoop() {
        if (!state.isMonitoring) {
            console.log('⏹️ Monitoring stopped');
            return;
        }
        
        try {
            // 檢查是否需要特殊處理
            if (state.accountStatus === 'rate_limited') {
                console.log('⏳ Waiting for rate limit cooldown...');
                setTimeout(monitorLoop, SAFETY_CONFIG.rateLimitCooldown * 1000);
                return;
            }
            
            const currentlyLive = await checkInstagramLiveSafely();
            
            // 檢查狀態變化
            if (currentlyLive && !state.isLiveNow) {
                state.isLiveNow = true;
                console.log('🔴 STATUS CHANGE: User went LIVE!');
                await sendDiscordMessage(`🔴 **@${TARGET_USERNAME} is now LIVE!** 🎥

📺 Watch: https://www.instagram.com/${TARGET_USERNAME}/
⏰ Detected at: ${new Date().toLocaleString()}

🤖 Safe monitoring continues...`);
                
            } else if (!currentlyLive && state.isLiveNow) {
                state.isLiveNow = false;
                console.log('⚫ STATUS CHANGE: User went offline');
                await sendDiscordMessage(`⚫ @${TARGET_USERNAME} has ended their Instagram Live stream.

⏰ Ended at: ${new Date().toLocaleString()}`);
                
            } else {
                console.log(`📊 Status unchanged: ${currentlyLive ? '🔴 LIVE' : '⚫ Offline'} | Account: ${state.accountStatus} | Errors: ${state.consecutiveErrors}`);
            }
            
            // 動態調整下次檢查的時間
            const nextInterval = adjustInterval();
            console.log(`⏰ Next check in ${Math.round(nextInterval)} seconds`);
            
            setTimeout(monitorLoop, nextInterval * 1000);
            
        } catch (error) {
            console.error('❌ Error in monitoring loop:', error);
            state.consecutiveErrors++;
            
            // 發生錯誤時使用更長的間隔
            const errorInterval = Math.min(state.currentInterval * 2, SAFETY_CONFIG.maxBackoffInterval);
            setTimeout(monitorLoop, errorInterval * 1000);
        }
    }
    
    // 立即開始第一次檢查
    monitorLoop();
}

client.once('ready', async () => {
    console.log(`✅ Safe Instagram Live Monitor ready as ${client.user.tag}!`);
    
    const welcomeMsg = `🔍 **Safe Instagram Live Monitor Ready**

**Target:** @${TARGET_USERNAME}
**Safety Features:** ✅ Enabled

**Auto-Start Commands:**
\`!start\` - Begin 24/7 monitoring
\`!help\` - Show all commands

**All Commands:**
!start - 開始安全的24/7監控
!stop - 停止監控
!status - 詳細狀態報告（成功率、錯誤次數等）
!check - 手動安全檢查
!refresh - 刷新設備資料（避免被追蹤）

🛡️ **Safety Features:**
• Random intervals (90-180s)
• Account status monitoring  
• Auto error handling
• Rate limit protection
• Device rotation`;

    await sendDiscordMessage(welcomeMsg);
    
    // 可選：自動開始監控
    // startSafeMonitoring();
});

client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
});

// 優雅關閉
process.on('SIGINT', async () => {
    console.log('📴 Shutting down safely...');
    state.isMonitoring = false;
    await sendDiscordMessage('📴 Monitor shutting down...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('📴 Shutting down safely...');
    state.isMonitoring = false;
    await sendDiscordMessage('📴 Monitor shutting down...');
    process.exit(0);
});

client.login(DISCORD_TOKEN);