const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');
const fs = require('fs');
const path = require('path');

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

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    startDebugMonitoring();
});

async function sendDiscordMessage(message) {
    try {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        await channel.send(message);
        console.log('Discord message sent:', message);
    } catch (error) {
        console.error('Failed to send Discord message:', error);
    }
}

// 多種 User-Agent 輪換使用
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

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
                    data: buffer.toString('utf8'),
                    buffer: buffer
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

// 保存 HTML 到文件進行分析
async function saveHTMLForAnalysis(html, filename) {
    try {
        const filepath = path.join(__dirname, `debug_${filename}_${Date.now()}.html`);
        fs.writeFileSync(filepath, html, 'utf8');
        console.log(`📁 HTML saved to: ${filepath}`);
        return filepath;
    } catch (error) {
        console.error('❌ Failed to save HTML:', error);
        return null;
    }
}

// 更詳細的 HTML 分析
function analyzeHTMLContent(html, source) {
    console.log(`\n🔍 === Analyzing HTML from ${source} ===`);
    console.log(`📊 HTML length: ${html.length} chars`);
    
    // 檢查是否包含 React/Vue 等框架標識
    const frameworkIndicators = [
        { name: 'React', pattern: /react|__REACT/i },
        { name: 'Vue', pattern: /vue|__VUE/i },
        { name: 'Instagram JS', pattern: /_sharedData|InstagramWebDesktopFBWWW/i },
        { name: 'GraphQL', pattern: /graphql|query_hash/i }
    ];
    
    frameworkIndicators.forEach(indicator => {
        if (indicator.pattern.test(html)) {
            console.log(`✅ Found ${indicator.name} indicators`);
        }
    });
    
    // 尋找直播相關的關鍵詞
    const liveKeywords = [
        '直播', 'LIVE', 'Live', 'live', 'broadcast', 'streaming',
        'En vivo', 'En directo', 'Live now', '正在直播'
    ];
    
    console.log('\n📝 Live keyword analysis:');
    liveKeywords.forEach(keyword => {
        const matches = (html.match(new RegExp(keyword, 'gi')) || []).length;
        if (matches > 0) {
            console.log(`   "${keyword}": ${matches} occurrences`);
            
            // 找出包含關鍵詞的上下文
            const contextRegex = new RegExp(`.{0,50}${keyword}.{0,50}`, 'gi');
            const contexts = html.match(contextRegex) || [];
            contexts.slice(0, 3).forEach((context, idx) => {
                console.log(`     Context ${idx + 1}: ...${context.trim()}...`);
            });
        }
    });
    
    // 檢查 JSON 數據
    console.log('\n📦 JSON data analysis:');
    const jsonPatterns = [
        { name: 'window._sharedData', pattern: /window\._sharedData\s*=\s*({.*?});/s },
        { name: 'window.__additionalDataLoaded', pattern: /window\.__additionalDataLoaded\s*\(\s*'[^']+'\s*,\s*({.*?})\s*\)/s },
        { name: 'Instagram config', pattern: /"config"\s*:\s*({.*?})/s }
    ];
    
    jsonPatterns.forEach(jsonPattern => {
        const match = html.match(jsonPattern.pattern);
        if (match) {
            console.log(`✅ Found ${jsonPattern.name}`);
            try {
                const jsonData = JSON.parse(match[1]);
                console.log(`   Keys: ${Object.keys(jsonData).join(', ')}`);
                
                // 特別檢查可能包含直播信息的字段
                const liveFields = ['is_live', 'broadcast', 'live_broadcast_id', 'edge_owner_to_timeline_media'];
                liveFields.forEach(field => {
                    if (hasNestedProperty(jsonData, field)) {
                        console.log(`   🔴 Found potential live field: ${field}`);
                    }
                });
            } catch (e) {
                console.log(`   ❌ Failed to parse JSON: ${e.message}`);
            }
        }
    });
    
    // 檢查 meta tags 和其他結構化數據
    console.log('\n🏷️ Meta tags analysis:');
    const metaPatterns = [
        /<meta[^>]+property="og:type"[^>]+content="([^"]+)"/gi,
        /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/gi,
        /<meta[^>]+name="description"[^>]+content="([^"]+)"/gi
    ];
    
    metaPatterns.forEach(pattern => {
        const matches = [...html.matchAll(pattern)];
        matches.forEach(match => {
            console.log(`   Meta: ${match[1]}`);
        });
    });
}

// 輔助函數：檢查嵌套屬性
function hasNestedProperty(obj, prop) {
    return JSON.stringify(obj).includes(`"${prop}"`);
}

// 多方法對比檢測
async function checkLiveStatusWithComparison() {
    const timestamp = new Date().toISOString();
    console.log(`\n🔍 === Multi-method Live Status Check (${timestamp}) ===`);
    
    const results = {};
    
    // 方法 1: 基本 GET 請求
    try {
        console.log('\n🌐 Method 1: Basic GET request');
        const basicResponse = await makeRequest(`https://www.instagram.com/${TARGET_USERNAME}/`, {
            method: 'GET',
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        
        const basicFile = await saveHTMLForAnalysis(basicResponse.data, 'basic_get');
        analyzeHTMLContent(basicResponse.data, 'Basic GET');
        results.basic = checkHTMLForLiveStatus(basicResponse.data);
        
    } catch (error) {
        console.error('❌ Basic GET failed:', error);
        results.basic = false;
    }
    
    // 方法 2: 模擬瀏覽器請求（包含更多 headers）
    try {
        console.log('\n🌐 Method 2: Browser-like request');
        const browserResponse = await makeRequest(`https://www.instagram.com/${TARGET_USERNAME}/`, {
            method: 'GET',
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
                'Upgrade-Insecure-Requests': '1',
                'Connection': 'keep-alive'
            }
        });
        
        const browserFile = await saveHTMLForAnalysis(browserResponse.data, 'browser_like');
        analyzeHTMLContent(browserResponse.data, 'Browser-like');
        results.browser = checkHTMLForLiveStatus(browserResponse.data);
        
    } catch (error) {
        console.error('❌ Browser-like request failed:', error);
        results.browser = false;
    }
    
    // 方法 3: 嘗試 GraphQL API
    try {
        console.log('\n🌐 Method 3: GraphQL API attempt');
        // 這需要更複雜的實現，先作為占位符
        results.graphql = false;
    } catch (error) {
        console.error('❌ GraphQL request failed:', error);
        results.graphql = false;
    }
    
    // 比較結果
    console.log('\n📊 === Results Comparison ===');
    Object.entries(results).forEach(([method, isLive]) => {
        console.log(`   ${method}: ${isLive ? '🔴 LIVE' : '⚫ Offline'}`);
    });
    
    // 如果結果不一致，發送警告
    const uniqueResults = [...new Set(Object.values(results))];
    if (uniqueResults.length > 1) {
        console.log('⚠️ WARNING: Inconsistent results detected!');
        await sendDiscordMessage(`⚠️ Inconsistent live detection results for @${TARGET_USERNAME}:\n${Object.entries(results).map(([k,v]) => `${k}: ${v ? 'LIVE' : 'Offline'}`).join('\n')}`);
    }
    
    // 返回最可能正確的結果（可以根據經驗調整邏輯）
    return results.browser || results.basic || results.graphql;
}

function checkHTMLForLiveStatus(html) {
    // 你原本的 HTML 檢測邏輯，但加上更多調試信息
    const liveTexts = ['直播', 'LIVE', 'En vivo', 'Live'];
    
    for (const liveText of liveTexts) {
        const regex = new RegExp(`<span[^>]*>${liveText}</span>`, 'gi');
        const matches = html.match(regex);
        
        if (matches) {
            console.log(`🔴 LIVE DETECTED: Found ${liveText} in span tag`);
            console.log(`   Matches: ${matches.length}`);
            return true;
        }
    }
    
    return false;
}

async function startDebugMonitoring() {
    console.log(`🚀 Starting Instagram Live DEBUG monitoring for @${TARGET_USERNAME}`);
    
    await sendDiscordMessage(`🔍 Instagram Live Monitor started (DEBUG MODE) for @${TARGET_USERNAME}\n\n📋 Will save HTML files for analysis`);
    
    // 立即執行一次詳細檢查
    console.log('🔎 Performing initial detailed analysis...');
    const initialStatus = await checkLiveStatusWithComparison();
    isLiveNow = initialStatus;
    
    // 每 5 分鐘執行一次（調試時可以更頻繁）
    setInterval(async () => {
        try {
            const currentlyLive = await checkLiveStatusWithComparison();
            
            if (currentlyLive && !isLiveNow) {
                isLiveNow = true;
                console.log('🔴 STATUS CHANGE: User went LIVE!');
                await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is now LIVE on Instagram! 🎥\n\nhttps://www.instagram.com/${TARGET_USERNAME}/`);
            } else if (!currentlyLive && isLiveNow) {
                isLiveNow = false;
                console.log('⚫ STATUS CHANGE: User went offline');
                await sendDiscordMessage(`⚫ @${TARGET_USERNAME} has ended their Instagram Live stream.`);
            }
            
        } catch (error) {
            console.error('❌ Error in debug monitoring loop:', error);
        }
    }, 5 * 60 * 1000); // 5 minutes
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await client.destroy();
    process.exit(0);
});

// Start the bot
client.login(DISCORD_TOKEN);