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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    cookies: `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`
};

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
        // 確保消息不超過 Discord 限制
        if (message.length > 1900) {
            message = message.substring(0, 1900) + '...(truncated)';
        }
        await channel.send(message);
    } catch (error) {
        console.error('Failed to send Discord message:', error);
    }
}

// 精確的直播檢測邏輯
function detectPreciseLiveStatus(html) {
    console.log('\n🎯 === Precise Live Detection ===');
    
    const results = {
        liveIndicators: [],
        falsePositives: [],
        jsonBlocks: [],
        finalDecision: false,
        confidence: 'NONE'
    };
    
    // 1. 過濾掉已知的假陽性模式（靜態 UI 元素）
    console.log('🚫 Filtering out false positives...');
    const falsePositivePatterns = [
        /data-sjs>/g,                           // 靜態 JavaScript 載入器
        /--ig-live-badge:/g,                    // CSS 變量定義
        /--live-video-border-radius:/g,         // CSS 變量定義
        /"type":"js"/g,                         // 資源載入配置
        /"type":"css"/g,                        // 資源載入配置
        /is_latency_sensitive_broadcast/g,      // 通用配置
        /streaming_implementation/g,            // 通用配置
        /hive_streaming_video/g                 // 通用配置
    ];
    
    falsePositivePatterns.forEach((pattern, idx) => {
        const matches = html.match(pattern) || [];
        if (matches.length > 0) {
            results.falsePositives.push({
                pattern: `FP${idx + 1}`,
                count: matches.length,
                description: 'Static UI element'
            });
            console.log(`   🚫 False positive ${idx + 1}: ${matches.length} matches (filtered out)`);
        }
    });
    
    // 2. 尋找真正的直播指標
    console.log('\n🔍 Looking for genuine live indicators...');
    
    // 真正的直播狀態指標
    const genuineLivePatterns = [
        {
            name: 'Live Badge Text',
            pattern: /<[^>]*>[\s]*(?:直播|LIVE|Live now|正在直播)[\s]*<\/[^>]*>/gi,
            confidence: 'HIGH'
        },
        {
            name: 'Live Broadcast ID',
            pattern: /"live_broadcast_id"\s*:\s*"[a-zA-Z0-9_-]+"/gi,
            confidence: 'VERY_HIGH'
        },
        {
            name: 'Is Live True',
            pattern: /"is_live"\s*:\s*true/gi,
            confidence: 'VERY_HIGH'
        },
        {
            name: 'Broadcast Status Active',
            pattern: /"broadcast_status"\s*:\s*"active"/gi,
            confidence: 'VERY_HIGH'
        },
        {
            name: 'Live Stream URL',
            pattern: /"dash_manifest"\s*:\s*"[^"]*live[^"]*"/gi,
            confidence: 'HIGH'
        },
        {
            name: 'Live Viewer Count',
            pattern: /"viewer_count"\s*:\s*[0-9]+/gi,
            confidence: 'MEDIUM'
        },
        {
            name: 'Live Media Type',
            pattern: /"media_type"\s*:\s*4/gi,
            confidence: 'HIGH'
        }
    ];
    
    genuineLivePatterns.forEach(pattern => {
        const matches = html.match(pattern.pattern) || [];
        if (matches.length > 0) {
            results.liveIndicators.push({
                name: pattern.name,
                count: matches.length,
                confidence: pattern.confidence,
                examples: matches.slice(0, 2)
            });
            console.log(`   ✅ ${pattern.name}: ${matches.length} matches (${pattern.confidence})`);
            matches.slice(0, 2).forEach((match, idx) => {
                console.log(`      ${idx + 1}. ${match}`);
            });
        }
    });
    
    // 3. 尋找和解析 JSON 數據中的用戶狀態
    console.log('\n📦 Looking for user status in JSON...');
    
    // 尋找包含用戶數據的 JSON 塊
    const jsonPatterns = [
        /"user"\s*:\s*{[^{}]*"username"\s*:\s*"suteaka4649_"[^{}]*}/g,
        /window\._sharedData\s*=\s*({.*?});/s,
        /"ProfilePage"\s*:\s*\[({.*?})\]/s
    ];
    
    jsonPatterns.forEach((pattern, idx) => {
        const matches = html.match(pattern);
        if (matches) {
            console.log(`   📦 Found JSON pattern ${idx + 1}: ${matches.length} matches`);
            
            matches.forEach((match, matchIdx) => {
                try {
                    // 嘗試從匹配中提取 JSON
                    let jsonStr = match;
                    if (match.includes('window._sharedData')) {
                        jsonStr = match.split('=')[1].replace(/;$/, '');
                    }
                    
                    const jsonData = JSON.parse(jsonStr);
                    const userStatus = extractUserLiveStatus(jsonData);
                    
                    if (userStatus.found) {
                        results.jsonBlocks.push({
                            pattern: idx + 1,
                            match: matchIdx + 1,
                            status: userStatus
                        });
                        console.log(`      ✅ User status found: ${JSON.stringify(userStatus)}`);
                    }
                    
                } catch (e) {
                    console.log(`      ❌ Failed to parse JSON block: ${e.message}`);
                }
            });
        }
    });
    
    // 4. 計算最終決定和置信度
    console.log('\n🎯 Calculating final decision...');
    
    const veryHighIndicators = results.liveIndicators.filter(i => i.confidence === 'VERY_HIGH');
    const highIndicators = results.liveIndicators.filter(i => i.confidence === 'HIGH');
    const mediumIndicators = results.liveIndicators.filter(i => i.confidence === 'MEDIUM');
    const jsonPositives = results.jsonBlocks.filter(j => j.status.isLive);
    
    if (veryHighIndicators.length > 0 || jsonPositives.length > 0) {
        results.finalDecision = true;
        results.confidence = 'VERY_HIGH';
        console.log('   🔴 LIVE: Very high confidence indicators found');
    } else if (highIndicators.length >= 2) {
        results.finalDecision = true;
        results.confidence = 'HIGH';
        console.log('   🔴 LIVE: Multiple high confidence indicators found');
    } else if (highIndicators.length === 1 && mediumIndicators.length >= 1) {
        results.finalDecision = true;
        results.confidence = 'MEDIUM';
        console.log('   🟡 LIVE: Combined indicators suggest live status');
    } else {
        results.finalDecision = false;
        results.confidence = 'NONE';
        console.log('   ⚫ NOT LIVE: No convincing indicators found');
    }
    
    return results;
}

// 從 JSON 數據中提取用戶直播狀態
function extractUserLiveStatus(jsonData) {
    const result = {
        found: false,
        isLive: false,
        details: {}
    };
    
    try {
        // 方法 1: 直接在 user 對象中尋找
        if (jsonData.user) {
            result.found = true;
            result.details.source = 'direct_user';
            
            if (jsonData.user.is_live === true) {
                result.isLive = true;
                result.details.indicator = 'is_live';
            }
            
            if (jsonData.user.live_broadcast_id) {
                result.isLive = true;
                result.details.indicator = 'live_broadcast_id';
                result.details.broadcastId = jsonData.user.live_broadcast_id;
            }
        }
        
        // 方法 2: 在 GraphQL 結構中尋找
        if (jsonData.data?.user) {
            result.found = true;
            result.details.source = 'graphql_user';
            
            const user = jsonData.data.user;
            if (user.is_live === true) {
                result.isLive = true;
                result.details.indicator = 'is_live';
            }
        }
        
        // 方法 3: 在 ProfilePage 中尋找
        if (jsonData.entry_data?.ProfilePage?.[0]?.graphql?.user) {
            result.found = true;
            result.details.source = 'profile_page';
            
            const user = jsonData.entry_data.ProfilePage[0].graphql.user;
            if (user.is_live === true) {
                result.isLive = true;
                result.details.indicator = 'is_live';
            }
        }
        
    } catch (error) {
        console.log(`   ❌ Error extracting user status: ${error.message}`);
    }
    
    return result;
}

// 主要檢測函數
async function checkInstagramLive() {
    console.log(`\n🔍 Precise Live Check for @${TARGET_USERNAME}...`);
    
    try {
        const response = await makeRequest(`https://www.instagram.com/${TARGET_USERNAME}/`, {
            method: 'GET',
            headers: {
                'User-Agent': sessionData.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cookie': sessionData.cookies,
                'Connection': 'keep-alive'
            }
        });
        
        if (response.statusCode !== 200) {
            console.log(`❌ Request failed with status: ${response.statusCode}`);
            return false;
        }
        
        console.log(`✅ Got HTML content: ${response.data.length} characters`);
        
        // 使用精確檢測
        const analysis = detectPreciseLiveStatus(response.data);
        
        // 創建簡潔的摘要
        const summary = `🎯 **Precise Live Analysis:**
📊 Genuine indicators: ${analysis.liveIndicators.length}
🚫 False positives filtered: ${analysis.falsePositives.length}
📦 JSON blocks with user data: ${analysis.jsonBlocks.length}
🎯 **Decision: ${analysis.finalDecision ? '🔴 LIVE' : '⚫ NOT LIVE'}**
📈 Confidence: ${analysis.confidence}`;

        await sendDiscordMessage(summary);
        
        // 如果找到真正的指標，顯示它們
        if (analysis.liveIndicators.length > 0) {
            const indicators = analysis.liveIndicators.map((ind, idx) => 
                `${idx + 1}. ${ind.name}: ${ind.count} (${ind.confidence})`
            ).join('\n');
            
            await sendDiscordMessage(`🔍 **Live Indicators Found:**\n\`\`\`\n${indicators}\n\`\`\``);
        }
        
        // 如果找到 JSON 數據，顯示用戶狀態
        if (analysis.jsonBlocks.length > 0) {
            const jsonInfo = analysis.jsonBlocks.map((block, idx) => 
                `${idx + 1}. Pattern ${block.pattern}: Live=${block.status.isLive} (${block.status.details.source})`
            ).join('\n');
            
            await sendDiscordMessage(`📦 **JSON User Status:**\n\`\`\`\n${jsonInfo}\n\`\`\``);
        }
        
        console.log(`🎯 Final result: ${analysis.finalDecision ? 'LIVE' : 'NOT LIVE'} (${analysis.confidence})`);
        
        return analysis.finalDecision;
        
    } catch (error) {
        console.error('❌ Error checking Instagram:', error);
        await sendDiscordMessage(`❌ Error: ${error.message}`);
        return false;
    }
}

// Discord 命令處理
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    
    if (content === '!check') {
        await message.reply('🎯 Running precise live detection...');
        const isLive = await checkInstagramLive();
        const status = isLive ? '🔴 LIVE DETECTED' : '⚫ Not Live';
        await message.reply(`📊 **Precise Result:** ${status}`);
    }
    
    if (content === '!status') {
        const status = isLiveNow ? '🔴 LIVE' : '⚫ Offline';
        await message.reply(`📊 **Monitor Status**\nTarget: @${TARGET_USERNAME}\nCurrent: ${status}\n\n💡 Use \`!check\` for precise detection`);
    }
    
    if (content === '!monitor') {
        await message.reply('🚀 Starting precise monitoring...');
        startPreciseMonitoring();
    }
    
    if (content === '!help') {
        await message.reply(`🎯 **Precise Instagram Live Detector**\n\n\`!check\` - Run precise live detection\n\`!monitor\` - Start continuous monitoring\n\`!status\` - Check current status\n\`!help\` - Show this help`);
    }
});

// 精確持續監控
function startPreciseMonitoring() {
    console.log('🚀 Starting precise continuous monitoring...');
    
    setInterval(async () => {
        try {
            const currentlyLive = await checkInstagramLive();
            
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
    console.log(`✅ Precise detector ready as ${client.user.tag}!`);
    sendDiscordMessage(`🎯 **Precise Instagram Live Detector Ready**\nTarget: @${TARGET_USERNAME}\n\n💡 Use \`!check\` for precise live detection\n💡 Use \`!monitor\` to start continuous monitoring`);
});

client.login(DISCORD_TOKEN);