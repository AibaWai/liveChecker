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
        await channel.send(message);
    } catch (error) {
        console.error('Failed to send Discord message:', error);
    }
}

// 深度分析 HTML 中的直播指標
function analyzeLiveContent(html) {
    console.log('\n🔍 === Deep Live Analysis ===');
    
    const results = {
        totalKeywords: 0,
        liveIndicators: [],
        suspiciousPatterns: [],
        jsonData: [],
        recommendations: []
    };
    
    // 1. 分析所有直播關鍵詞的上下文
    console.log('\n📝 Analyzing live keyword contexts...');
    const liveKeywords = ['直播', 'LIVE', 'Live', 'live', 'broadcast', 'streaming'];
    
    liveKeywords.forEach(keyword => {
        const regex = new RegExp(`.{0,50}${keyword}.{0,50}`, 'gi');
        const contexts = html.match(regex) || [];
        
        if (contexts.length > 0) {
            console.log(`\n🔤 Keyword "${keyword}" found ${contexts.length} times:`);
            results.totalKeywords += contexts.length;
            
            contexts.slice(0, 5).forEach((context, idx) => {
                console.log(`   ${idx + 1}. ...${context.trim()}...`);
                
                // 檢查是否為真正的直播指標
                if (isLiveIndicator(context, keyword)) {
                    results.liveIndicators.push({
                        keyword: keyword,
                        context: context.trim(),
                        confidence: getLiveConfidence(context, keyword)
                    });
                }
            });
        }
    });
    
    // 2. 尋找 JSON 數據塊
    console.log('\n📦 Looking for JSON data blocks...');
    const jsonPatterns = [
        /window\._sharedData\s*=\s*({.*?});/s,
        /"user"\s*:\s*({[^}]*"username"[^}]*})/g,
        /"live[^"]*"\s*:\s*([^,}\]]+)/gi,
        /"broadcast[^"]*"\s*:\s*([^,}\]]+)/gi
    ];
    
    jsonPatterns.forEach((pattern, idx) => {
        const matches = html.match(pattern);
        if (matches) {
            console.log(`✅ Found JSON pattern ${idx + 1}: ${matches.length} matches`);
            matches.slice(0, 3).forEach(match => {
                results.jsonData.push({
                    pattern: idx + 1,
                    content: match.substring(0, 200) + '...'
                });
            });
        }
    });
    
    // 3. 檢查特殊的直播相關模式
    console.log('\n🎯 Checking live-specific patterns...');
    const livePatterns = [
        /"is_live"\s*:\s*true/i,
        /"live_broadcast_id"\s*:\s*"[^"]+"/i,
        /class="[^"]*live[^"]*"/gi,
        /aria-label="[^"]*live[^"]*"/gi,
        /data-[^=]*live[^=]*="/gi,
        /"__typename"\s*:\s*"[^"]*Live[^"]*"/gi
    ];
    
    livePatterns.forEach((pattern, idx) => {
        const matches = html.match(pattern);
        if (matches) {
            console.log(`🔴 Live pattern ${idx + 1}: ${matches.length} matches`);
            matches.slice(0, 3).forEach(match => {
                results.suspiciousPatterns.push({
                    pattern: idx + 1,
                    match: match,
                    confidence: 'HIGH'
                });
            });
        }
    });
    
    // 4. 分析頁面結構
    console.log('\n🏗️ Analyzing page structure...');
    const structureChecks = [
        { name: 'Meta tags', pattern: /<meta[^>]+live[^>]*>/gi },
        { name: 'CSS classes', pattern: /class="[^"]*live[^"]*"/gi },
        { name: 'Data attributes', pattern: /data-[^=]*live[^=]*="/gi },
        { name: 'Script variables', pattern: /var\s+[^=]*live[^=]*=/gi }
    ];
    
    structureChecks.forEach(check => {
        const matches = html.match(check.pattern);
        if (matches) {
            console.log(`   ${check.name}: ${matches.length} matches`);
        }
    });
    
    // 5. 生成建議
    console.log('\n💡 Generating recommendations...');
    
    if (results.suspiciousPatterns.length > 0) {
        results.recommendations.push('🔴 Found HIGH confidence live patterns - likely live streaming!');
    }
    
    if (results.liveIndicators.length > 0) {
        const highConfidence = results.liveIndicators.filter(i => i.confidence === 'HIGH');
        if (highConfidence.length > 0) {
            results.recommendations.push(`🟡 Found ${highConfidence.length} high-confidence live indicators`);
        }
    }
    
    if (results.totalKeywords > 300) {
        results.recommendations.push('⚠️ Very high keyword count - may include UI elements');
    }
    
    if (results.jsonData.length > 0) {
        results.recommendations.push('📦 Found JSON data - should parse for live status');
    }
    
    return results;
}

// 判斷是否為真正的直播指標
function isLiveIndicator(context, keyword) {
    const liveContexts = [
        /is.*live/i,
        /live.*stream/i,
        /live.*broadcast/i,
        /going.*live/i,
        /now.*live/i,
        /"live"\s*:\s*true/i,
        /live_broadcast_id/i,
        /broadcast_status/i
    ];
    
    return liveContexts.some(pattern => pattern.test(context));
}

// 評估直播指標的置信度
function getLiveConfidence(context, keyword) {
    if (/"live"\s*:\s*true/i.test(context)) return 'HIGH';
    if (/live_broadcast_id|broadcast_status/i.test(context)) return 'HIGH';
    if (/is.*live|going.*live|now.*live/i.test(context)) return 'MEDIUM';
    if (/class|aria|data/.test(context)) return 'LOW';
    return 'UNKNOWN';
}

// 主要檢測函數
async function checkInstagramLive() {
    console.log(`\n🔍 Checking @${TARGET_USERNAME} for live status...`);
    
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
        
        // 深度分析內容
        const analysis = analyzeLiveContent(response.data);
        
        // 發送分析結果到 Discord
        const summary = `📊 **Live Analysis Results:**
🔤 Total keywords: ${analysis.totalKeywords}
🔴 High-confidence patterns: ${analysis.suspiciousPatterns.length}
🟡 Live indicators: ${analysis.liveIndicators.length}
📦 JSON data blocks: ${analysis.jsonData.length}

**Recommendations:**
${analysis.recommendations.map(r => `• ${r}`).join('\n')}`;

        await sendDiscordMessage(summary);
        
        // 如果有高置信度的模式，顯示詳細信息
        if (analysis.suspiciousPatterns.length > 0) {
            const patterns = analysis.suspiciousPatterns.slice(0, 3).map((p, idx) => 
                `${idx + 1}. ${p.match}`
            ).join('\n');
            
            await sendDiscordMessage(`🔴 **High-Confidence Live Patterns:**\n\`\`\`\n${patterns}\n\`\`\``);
        }
        
        // 如果有直播指標，顯示它們
        if (analysis.liveIndicators.length > 0) {
            const indicators = analysis.liveIndicators.slice(0, 3).map((i, idx) => 
                `${idx + 1}. [${i.confidence}] ${i.keyword}: ${i.context.substring(0, 100)}...`
            ).join('\n');
            
            await sendDiscordMessage(`🟡 **Live Indicators:**\n\`\`\`\n${indicators}\n\`\`\``);
        }
        
        // 決定是否在直播
        const isLive = analysis.suspiciousPatterns.length > 0 || 
                      analysis.liveIndicators.filter(i => i.confidence === 'HIGH').length > 0;
        
        console.log(`🎯 Final decision: ${isLive ? 'LIVE' : 'NOT LIVE'}`);
        
        return isLive;
        
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
        await message.reply('🔍 Analyzing Instagram live content...');
        const isLive = await checkInstagramLive();
        const status = isLive ? '🔴 LIVE DETECTED' : '⚫ Not Live';
        await message.reply(`📊 **Result:** ${status}`);
    }
    
    if (content === '!status') {
        const status = isLiveNow ? '🔴 LIVE' : '⚫ Offline';
        await message.reply(`📊 **Monitor Status**\nTarget: @${TARGET_USERNAME}\nCurrent: ${status}\n\n💡 Use \`!check\` to analyze live content`);
    }
    
    if (content === '!monitor') {
        await message.reply('🚀 Starting continuous monitoring...');
        startMonitoring();
    }
    
    if (content === '!help') {
        await message.reply(`🤖 **Instagram Live Analyzer**\n\n\`!check\` - Analyze current live status\n\`!monitor\` - Start continuous monitoring\n\`!status\` - Check current status\n\`!help\` - Show this help`);
    }
});

// 持續監控
function startMonitoring() {
    console.log('🚀 Starting continuous monitoring...');
    
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
    console.log(`✅ Live analyzer ready as ${client.user.tag}!`);
    sendDiscordMessage(`🔍 **Instagram Live Analyzer Ready**\nTarget: @${TARGET_USERNAME}\n\n💡 Use \`!check\` to analyze live content\n💡 Use \`!monitor\` to start continuous monitoring`);
});

client.login(DISCORD_TOKEN);