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
let lastHTMLSnapshot = null;

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
        if (message.length > 1900) {
            message = message.substring(0, 1900) + '...(truncated)';
        }
        await channel.send(message);
    } catch (error) {
        console.error('Failed to send Discord message:', error);
    }
}

// 更聰明的直播檢測 - 基於內容差異分析
function detectLiveStatusSmart(html, previousHTML = null) {
    console.log('\n🧠 === Smart Live Detection ===');
    
    const results = {
        contentSize: html.length,
        liveSignals: [],
        confidence: 0,
        comparison: null
    };
    
    // 1. 尋找確定的直播指標模式
    console.log('🎯 Looking for definitive live patterns...');
    
    const definitivePatterns = [
        {
            name: 'Live Badge in Story',
            pattern: /<[^>]*(?:story|reel)[^>]*>[\s\S]*?(?:直播|LIVE|Live now)[\s\S]*?<\/[^>]*>/gi,
            confidence: 90
        },
        {
            name: 'Live Broadcast JSON',
            pattern: /"broadcast":\s*{[^}]*"broadcast_status":\s*"active"[^}]*}/gi,
            confidence: 95
        },
        {
            name: 'Live Media Type',
            pattern: /"media_type":\s*4[^,}]*"is_live":\s*true/gi,
            confidence: 95
        },
        {
            name: 'Active Live Stream',
            pattern: /"is_live":\s*true[^,}]*"live_broadcast_id":\s*"[^"]+"/gi,
            confidence: 100
        },
        {
            name: 'Live Story Item',
            pattern: /"story_type":\s*"live"[^}]*|"__typename":\s*"[^"]*Live[^"]*"/gi,
            confidence: 85
        }
    ];
    
    definitivePatterns.forEach(pattern => {
        const matches = html.match(pattern.pattern) || [];
        if (matches.length > 0) {
            results.liveSignals.push({
                type: pattern.name,
                count: matches.length,
                confidence: pattern.confidence,
                examples: matches.slice(0, 2)
            });
            
            console.log(`   ✅ ${pattern.name}: ${matches.length} matches (confidence: ${pattern.confidence}%)`);
            matches.slice(0, 2).forEach((match, idx) => {
                console.log(`      ${idx + 1}. ${match.substring(0, 100)}...`);
            });
        }
    });
    
    // 2. 內容大小變化分析
    if (previousHTML) {
        const sizeDiff = html.length - previousHTML.length;
        const percentChange = Math.abs(sizeDiff) / previousHTML.length * 100;
        
        results.comparison = {
            sizeDifference: sizeDiff,
            percentChange: percentChange.toFixed(2),
            significant: percentChange > 5
        };
        
        console.log(`📊 Content size change: ${sizeDiff} bytes (${percentChange.toFixed(2)}%)`);
        
        if (percentChange > 10) {
            results.liveSignals.push({
                type: 'Significant Content Change',
                count: 1,
                confidence: 30,
                examples: [`${sizeDiff > 0 ? '+' : ''}${sizeDiff} bytes`]
            });
        }
    }
    
    // 3. 特殊的用戶狀態檢查
    console.log('👤 Checking user status patterns...');
    
    const userStatusPatterns = [
        {
            name: 'User Profile Live State',
            pattern: new RegExp(`"username":\\s*"${TARGET_USERNAME}"[^}]*"is_live":\\s*true`, 'gi'),
            confidence: 100
        },
        {
            name: 'Profile Page Live',
            pattern: /"ProfilePage"[\s\S]*?"is_live":\s*true[\s\S]*?"username":\s*"[^"]*"/gi,
            confidence: 85
        },
        {
            name: 'Live in Timeline',
            pattern: /"edge_owner_to_timeline_media"[\s\S]*?"media_type":\s*4/gi,
            confidence: 75
        }
    ];
    
    userStatusPatterns.forEach(pattern => {
        const matches = html.match(pattern.pattern) || [];
        if (matches.length > 0) {
            results.liveSignals.push({
                type: pattern.name,
                count: matches.length,
                confidence: pattern.confidence,
                examples: matches.slice(0, 1)
            });
            
            console.log(`   🔴 ${pattern.name}: ${matches.length} matches (confidence: ${pattern.confidence}%)`);
        }
    });
    
    // 4. 計算總體置信度
    if (results.liveSignals.length > 0) {
        const totalConfidence = results.liveSignals.reduce((sum, signal) => {
            return sum + (signal.confidence * signal.count);
        }, 0);
        
        const maxPossible = results.liveSignals.reduce((sum, signal) => {
            return sum + (100 * signal.count);
        }, 0);
        
        results.confidence = Math.min(100, (totalConfidence / maxPossible) * 100);
    }
    
    // 5. 最終決定
    const highConfidenceSignals = results.liveSignals.filter(s => s.confidence >= 85);
    const veryHighConfidenceSignals = results.liveSignals.filter(s => s.confidence >= 95);
    
    let decision = false;
    let reason = 'No reliable indicators found';
    
    if (veryHighConfidenceSignals.length > 0) {
        decision = true;
        reason = `Very high confidence indicators: ${veryHighConfidenceSignals.map(s => s.type).join(', ')}`;
    } else if (highConfidenceSignals.length >= 2) {
        decision = true;
        reason = `Multiple high confidence indicators: ${highConfidenceSignals.map(s => s.type).join(', ')}`;
    } else if (results.confidence > 70) {
        decision = true;
        reason = `High overall confidence: ${results.confidence.toFixed(1)}%`;
    }
    
    console.log(`\n🎯 Decision: ${decision ? '🔴 LIVE' : '⚫ NOT LIVE'}`);
    console.log(`📊 Confidence: ${results.confidence.toFixed(1)}%`);
    console.log(`💭 Reason: ${reason}`);
    
    return {
        isLive: decision,
        confidence: results.confidence,
        reason: reason,
        signals: results.liveSignals,
        comparison: results.comparison
    };
}

// 主要檢測函數
async function checkInstagramLiveSmart() {
    console.log(`\n🔍 Smart Live Check for @${TARGET_USERNAME}...`);
    
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
        
        // 使用智能檢測
        const analysis = detectLiveStatusSmart(response.data, lastHTMLSnapshot);
        
        // 更新快照
        lastHTMLSnapshot = response.data;
        
        // 創建報告
        const report = `🧠 **Smart Live Detection Results:**

📊 **Confidence:** ${analysis.confidence.toFixed(1)}%
🎯 **Decision:** ${analysis.isLive ? '🔴 LIVE' : '⚫ NOT LIVE'}
💭 **Reason:** ${analysis.reason}

📊 **Signals Found:** ${analysis.signals.length}
${analysis.signals.map(s => `• ${s.type}: ${s.count} (${s.confidence}%)`).join('\n')}

${analysis.comparison ? `📈 **Content Change:** ${analysis.comparison.sizeDifference} bytes (${analysis.comparison.percentChange}%)` : ''}`;

        await sendDiscordMessage(report);
        
        // 如果找到高置信度信號，顯示詳細信息
        const highConfidenceSignals = analysis.signals.filter(s => s.confidence >= 85);
        if (highConfidenceSignals.length > 0) {
            const details = highConfidenceSignals.slice(0, 3).map(signal => 
                `**${signal.type}** (${signal.confidence}%):\n${signal.examples.map(ex => `\`${ex.substring(0, 150)}...\``).join('\n')}`
            ).join('\n\n');
            
            await sendDiscordMessage(`🔍 **High Confidence Signals:**\n${details}`);
        }
        
        console.log(`🎯 Final result: ${analysis.isLive ? 'LIVE' : 'NOT LIVE'} (${analysis.confidence.toFixed(1)}%)`);
        
        return analysis.isLive;
        
    } catch (error) {
        console.error('❌ Error in smart check:', error);
        await sendDiscordMessage(`❌ Error: ${error.message}`);
        return false;
    }
}

// Discord 命令處理
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    
    if (content === '!smart') {
        await message.reply('🧠 Running smart live detection...');
        const isLive = await checkInstagramLiveSmart();
        const status = isLive ? '🔴 LIVE DETECTED' : '⚫ Not Live';
        await message.reply(`📊 **Smart Result:** ${status}`);
    }
    
    if (content === '!status') {
        const status = isLiveNow ? '🔴 LIVE' : '⚫ Offline';
        await message.reply(`📊 **Monitor Status**\nTarget: @${TARGET_USERNAME}\nCurrent: ${status}\n\n💡 Use \`!smart\` for smart detection`);
    }
    
    if (content === '!monitor') {
        await message.reply('🚀 Starting smart monitoring...');
        startSmartMonitoring();
    }
    
    if (content === '!reset') {
        lastHTMLSnapshot = null;
        await message.reply('🔄 HTML snapshot reset for fresh comparison');
    }
    
    if (content === '!help') {
        await message.reply(`🧠 **Smart Instagram Live Detector**\n\n\`!smart\` - Run smart live detection\n\`!monitor\` - Start continuous monitoring\n\`!reset\` - Reset HTML snapshot\n\`!status\` - Check current status\n\`!help\` - Show this help`);
    }
});

// 智能持續監控
function startSmartMonitoring() {
    console.log('🚀 Starting smart monitoring...');
    
    setInterval(async () => {
        try {
            const currentlyLive = await checkInstagramLiveSmart();
            
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
    console.log(`✅ Smart detector ready as ${client.user.tag}!`);
    sendDiscordMessage(`🧠 **Smart Instagram Live Detector Ready**\nTarget: @${TARGET_USERNAME}\n\n💡 Use \`!smart\` for intelligent live detection\n💡 Use \`!monitor\` to start continuous monitoring`);
});

client.login(DISCORD_TOKEN);