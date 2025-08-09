const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const TARGET_USERNAME = process.env.TARGET_USERNAME;

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let isLiveNow = false;

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

// 測試 RTMP.IN API
async function testRTMPAPI() {
    console.log('\n🔍 Testing RTMP.IN API...');
    
    try {
        const response = await makeRequest('https://api.rtmp.in/info', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        console.log(`📊 RTMP.IN API response: ${response.statusCode}`);
        console.log(`📄 Response data: ${response.data}`);
        
        if (response.statusCode === 200) {
            try {
                const data = JSON.parse(response.data);
                
                const analysis = {
                    status: data.status,
                    hasBroadcast: !!data.broadcast,
                    userName: data.user_name || 'N/A',
                    uid: data.uid || 'N/A',
                    broadcastInfo: data.broadcast || null
                };
                
                console.log('✅ RTMP.IN API Success:');
                console.log(`   Status: ${analysis.status}`);
                console.log(`   Has Broadcast: ${analysis.hasBroadcast}`);
                console.log(`   User Name: ${analysis.userName}`);
                console.log(`   UID: ${analysis.uid}`);
                
                if (analysis.broadcastInfo) {
                    console.log('📺 Broadcast Info:');
                    console.log(`   ID: ${analysis.broadcastInfo.id}`);
                    console.log(`   Server: ${analysis.broadcastInfo.server}`);
                    console.log(`   Media ID: ${analysis.broadcastInfo.media_id}`);
                }
                
                return {
                    success: true,
                    data: analysis,
                    rawResponse: data
                };
                
            } catch (parseError) {
                console.error('❌ Failed to parse JSON:', parseError);
                return {
                    success: false,
                    error: 'JSON Parse Error',
                    rawData: response.data
                };
            }
        } else {
            console.log(`❌ API request failed: ${response.statusCode}`);
            return {
                success: false,
                error: `HTTP ${response.statusCode}`,
                rawData: response.data
            };
        }
        
    } catch (error) {
        console.error('❌ Error testing RTMP.IN API:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// 測試特定用戶的 API 端點（如果存在）
async function testUserSpecificAPI(username) {
    console.log(`\n🔍 Testing user-specific API for @${username}...`);
    
    const endpoints = [
        `https://api.rtmp.in/user/${username}`,
        `https://api.rtmp.in/broadcast/${username}`,
        `https://api.rtmp.in/status/${username}`,
        `https://api.rtmp.in/info/${username}`,
        `https://api.rtmp.in/live/${username}`
    ];
    
    const results = {};
    
    for (let i = 0; i < endpoints.length; i++) {
        const endpoint = endpoints[i];
        const endpointName = endpoint.split('/').pop();
        
        try {
            console.log(`🔍 Trying endpoint: ${endpoint}`);
            
            const response = await makeRequest(endpoint, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            console.log(`   Status: ${response.statusCode}`);
            
            results[endpointName] = {
                status: response.statusCode,
                success: response.statusCode === 200,
                data: response.data.substring(0, 200) + '...'
            };
            
            if (response.statusCode === 200) {
                try {
                    const data = JSON.parse(response.data);
                    console.log(`   ✅ Success! Data: ${JSON.stringify(data).substring(0, 100)}...`);
                } catch (e) {
                    console.log(`   ⚠️ Non-JSON response: ${response.data.substring(0, 50)}...`);
                }
            }
            
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
            results[endpointName] = {
                status: 'ERROR',
                success: false,
                error: error.message
            };
        }
        
        // 避免太快的請求
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
}

// 主要測試函數
async function runRTMPTests() {
    console.log('\n🧪 === Running RTMP.IN API Tests ===');
    
    // 測試 1: 基本 API
    const basicTest = await testRTMPAPI();
    
    // 測試 2: 用戶特定端點
    const userTests = await testUserSpecificAPI(TARGET_USERNAME);
    
    // 創建報告
    const report = `🧪 **RTMP.IN API Test Results:**

**Basic API (/info):**
Status: ${basicTest.success ? '✅ Success' : '❌ Failed'}
${basicTest.success ? 
  `User: ${basicTest.data.userName}
Has Broadcast: ${basicTest.data.hasBroadcast ? 'Yes' : 'No'}
UID: ${basicTest.data.uid}` : 
  `Error: ${basicTest.error}`
}

**User-Specific Endpoints for @${TARGET_USERNAME}:**
${Object.entries(userTests).map(([endpoint, result]) => 
  `• ${endpoint}: ${result.success ? '✅ Works' : `❌ ${result.status}`}`
).join('\n')}`;

    await sendDiscordMessage(report);
    
    // 如果基本 API 成功，顯示詳細信息
    if (basicTest.success && basicTest.rawResponse) {
        const detailedInfo = `📦 **Detailed API Response:**\n\`\`\`json\n${JSON.stringify(basicTest.rawResponse, null, 2)}\n\`\`\``;
        await sendDiscordMessage(detailedInfo);
    }
    
    // 分析結果
    console.log('\n📊 === Test Analysis ===');
    
    if (basicTest.success) {
        if (basicTest.data.userName === TARGET_USERNAME) {
            console.log('🎯 TARGET USER FOUND! This API can track our target user.');
        } else {
            console.log(`⚠️ API returns different user: ${basicTest.data.userName} (expected: ${TARGET_USERNAME})`);
            console.log('💭 This suggests the API only tracks users who use RTMP.IN service');
        }
    }
    
    const workingEndpoints = Object.entries(userTests).filter(([_, result]) => result.success);
    if (workingEndpoints.length > 0) {
        console.log(`✅ Found ${workingEndpoints.length} working user-specific endpoints`);
    } else {
        console.log('❌ No user-specific endpoints work');
    }
    
    return {
        basicAPI: basicTest,
        userEndpoints: userTests,
        canTrackTarget: basicTest.success && basicTest.data.userName === TARGET_USERNAME
    };
}

// Discord 命令處理
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    
    if (content === '!rtmp') {
        await message.reply('🧪 Testing RTMP.IN API capabilities...');
        const results = await runRTMPTests();
        
        const conclusion = results.canTrackTarget ? 
            '🎯 **GOOD NEWS!** This API can track our target user!' :
            '⚠️ **LIMITATION:** This API only tracks users who use RTMP.IN service';
            
        await message.reply(conclusion);
    }
    
    if (content === '!status') {
        const status = isLiveNow ? '🔴 LIVE' : '⚫ Offline';
        await message.reply(`📊 **Status**\nTarget: @${TARGET_USERNAME}\nCurrent: ${status}\n\n💡 Use \`!rtmp\` to test RTMP.IN API`);
    }
    
    if (content === '!help') {
        await message.reply(`🧪 **RTMP.IN API Tester**\n\n\`!rtmp\` - Test RTMP.IN API capabilities\n\`!status\` - Check current status\n\`!help\` - Show this help`);
    }
});

client.once('ready', () => {
    console.log(`✅ RTMP.IN API tester ready as ${client.user.tag}!`);
    sendDiscordMessage(`🧪 **RTMP.IN API Tester Ready**\nTarget: @${TARGET_USERNAME}\n\n💡 Use \`!rtmp\` to test API capabilities`);
});

client.login(DISCORD_TOKEN);