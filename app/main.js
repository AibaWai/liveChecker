const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const TARGET_USERNAME = process.env.TARGET_USERNAME;
// Instagram cookie 環境變量 (可選)
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

let isLiveNow = false;
let sessionData = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    cookies: '',
    hasValidSession: false
};

// Discord command handling

// 在你的 main.js 中的 Discord command handling 部分添加這些命令

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    
    // 原有命令...
    
    if (content === '!files') {
        await listDebugFiles(message);
    }
    
    if (content.startsWith('!export ')) {
        const filename = content.replace('!export ', '').trim();
        await exportFile(message, filename);
    }
    
    if (content === '!latest') {
        await exportLatestFiles(message);
    }
    
    if (content === '!api') {
        await exportLatestAPIResponse(message);
    }
    
    if (content === '!compare') {
        await compareLatestFiles(message);
    }
});

// 列出所有調試文件
async function listDebugFiles(message) {
    try {
        const debugDir = path.join(__dirname, 'debug-files');
        if (!fs.existsSync(debugDir)) {
            await message.reply('❌ No debug files directory found.');
            return;
        }
        
        const files = fs.readdirSync(debugDir)
            .filter(file => file.endsWith('.html') || file.endsWith('.txt'))
            .sort((a, b) => {
                const aTime = fs.statSync(path.join(debugDir, a)).mtime;
                const bTime = fs.statSync(path.join(debugDir, b)).mtime;
                return bTime - aTime; // 最新的在前
            });
        
        if (files.length === 0) {
            await message.reply('❌ No debug files found.');
            return;
        }
        
        const fileList = files.slice(0, 10).map((file, idx) => {
            const filepath = path.join(debugDir, file);
            const stats = fs.statSync(filepath);
            const size = (stats.size / 1024).toFixed(1);
            const time = stats.mtime.toLocaleString('zh-TW');
            return `${idx + 1}. \`${file}\` (${size}KB, ${time})`;
        }).join('\n');
        
        await message.reply(`📁 **Debug Files (最新10個):**\n${fileList}\n\n💡 使用 \`!export filename\` 來導出文件\n💡 使用 \`!latest\` 導出最新文件\n💡 使用 \`!api\` 導出最新API回應`);
        
    } catch (error) {
        await message.reply(`❌ Error listing files: ${error.message}`);
    }
}

// 導出指定文件
async function exportFile(message, filename) {
    try {
        const debugDir = path.join(__dirname, 'debug-files');
        const filepath = path.join(debugDir, filename);
        
        if (!fs.existsSync(filepath)) {
            await message.reply(`❌ File not found: ${filename}`);
            return;
        }
        
        const stats = fs.statSync(filepath);
        const fileSizeKB = (stats.size / 1024).toFixed(1);
        
        if (stats.size > 1900000) { // Discord 消息限制約 2MB
            await message.reply(`❌ File too large (${fileSizeKB}KB). Try using !analyze instead.`);
            return;
        }
        
        const content = fs.readFileSync(filepath, 'utf8');
        
        // 如果是 HTML 文件，創建一個簡化版本
        if (filename.endsWith('.html')) {
            const analysis = analyzeHTMLContent(content, filename);
            
            // 分段發送內容
            const chunks = chunkString(content, 1900);
            
            await message.reply(`📁 **${filename}** (${fileSizeKB}KB)\n📊 **Quick Analysis:** ${analysis ? '🔴 LIVE indicators found' : '⚫ No live indicators'}`);
            
            for (let i = 0; i < Math.min(chunks.length, 3); i++) { // 最多發送3段
                await message.channel.send(`\`\`\`html\n${chunks[i]}\n\`\`\``);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 避免速率限制
            }
            
            if (chunks.length > 3) {
                await message.channel.send(`... (省略了 ${chunks.length - 3} 段內容)`);
            }
            
        } else {
            // 文本文件直接發送
            await message.reply(`📁 **${filename}** (${fileSizeKB}KB):\n\`\`\`\n${content}\n\`\`\``);
        }
        
    } catch (error) {
        await message.reply(`❌ Error exporting file: ${error.message}`);
    }
}

// 導出最新的文件
async function exportLatestFiles(message) {
    try {
        const debugDir = path.join(__dirname, 'debug-files');
        if (!fs.existsSync(debugDir)) {
            await message.reply('❌ No debug files directory found.');
            return;
        }
        
        const files = fs.readdirSync(debugDir)
            .filter(file => file.endsWith('.html'))
            .sort((a, b) => {
                const aTime = fs.statSync(path.join(debugDir, a)).mtime;
                const bTime = fs.statSync(path.join(debugDir, b)).mtime;
                return bTime - aTime;
            });
        
        if (files.length === 0) {
            await message.reply('❌ No HTML files found.');
            return;
        }
        
        // 導出最新的3個文件
        const latestFiles = files.slice(0, 3);
        
        for (const file of latestFiles) {
            await exportFile(message, file);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒避免速率限制
        }
        
    } catch (error) {
        await message.reply(`❌ Error exporting latest files: ${error.message}`);
    }
}

// 導出最新的 API 回應
async function exportLatestAPIResponse(message) {
    try {
        const debugDir = path.join(__dirname, 'debug-files');
        const files = fs.readdirSync(debugDir)
            .filter(file => file.includes('api_response') && file.endsWith('.html'))
            .sort((a, b) => {
                const aTime = fs.statSync(path.join(debugDir, a)).mtime;
                const bTime = fs.statSync(path.join(debugDir, b)).mtime;
                return bTime - aTime;
            });
        
        if (files.length === 0) {
            await message.reply('❌ No API response files found.');
            return;
        }
        
        const latestAPI = files[0];
        const filepath = path.join(debugDir, latestAPI);
        const content = fs.readFileSync(filepath, 'utf8');
        
        try {
            // 嘗試解析並美化 JSON
            const jsonData = JSON.parse(content);
            const prettyJSON = JSON.stringify(jsonData, null, 2);
            
            // 分段發送
            const chunks = chunkString(prettyJSON, 1900);
            
            await message.reply(`📡 **Latest API Response** (${latestAPI}):`);
            
            for (let i = 0; i < Math.min(chunks.length, 5); i++) {
                await message.channel.send(`\`\`\`json\n${chunks[i]}\n\`\`\``);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            if (chunks.length > 5) {
                await message.channel.send(`... (省略了 ${chunks.length - 5} 段內容)`);
            }
            
            // 特別檢查用戶數據
            const user = jsonData.data?.user;
            if (user) {
                const userSummary = {
                    username: user.username,
                    full_name: user.full_name,
                    is_private: user.is_private,
                    is_verified: user.is_verified,
                    follower_count: user.edge_followed_by?.count,
                    following_count: user.edge_follow?.count,
                    post_count: user.edge_owner_to_timeline_media?.count
                };
                
                await message.channel.send(`👤 **User Summary:**\n\`\`\`json\n${JSON.stringify(userSummary, null, 2)}\n\`\`\``);
                
                // 檢查所有可能的直播相關字段
                const allKeys = Object.keys(user);
                const liveKeys = allKeys.filter(key => 
                    /live|broadcast|stream|story/i.test(key)
                );
                
                if (liveKeys.length > 0) {
                    const liveData = {};
                    liveKeys.forEach(key => {
                        liveData[key] = user[key];
                    });
                    
                    await message.channel.send(`🔍 **Live-related fields:**\n\`\`\`json\n${JSON.stringify(liveData, null, 2)}\n\`\`\``);
                }
            }
            
        } catch (e) {
            await message.reply(`❌ Failed to parse API response as JSON: ${e.message}`);
            await exportFile(message, latestAPI);
        }
        
    } catch (error) {
        await message.reply(`❌ Error exporting API response: ${error.message}`);
    }
}

// 比較最新的文件
async function compareLatestFiles(message) {
    try {
        const debugDir = path.join(__dirname, 'debug-files');
        const files = fs.readdirSync(debugDir)
            .filter(file => file.endsWith('.html'))
            .sort((a, b) => {
                const aTime = fs.statSync(path.join(debugDir, a)).mtime;
                const bTime = fs.statSync(path.join(debugDir, b)).mtime;
                return bTime - aTime;
            });
        
        if (files.length < 2) {
            await message.reply('❌ Need at least 2 files to compare.');
            return;
        }
        
        const comparison = [];
        
        files.slice(0, 3).forEach(file => {
            const filepath = path.join(debugDir, file);
            const content = fs.readFileSync(filepath, 'utf8');
            const stats = fs.statSync(filepath);
            
            const analysis = {
                filename: file,
                size: `${(stats.size / 1024).toFixed(1)}KB`,
                hasSharedData: /_sharedData/.test(content),
                liveKeywords: (content.match(/直播|LIVE|live/gi) || []).length,
                hasUserData: /"username":\s*"suteaka4649_"/.test(content),
                framework: []
            };
            
            if (/react|__REACT/i.test(content)) analysis.framework.push('React');
            if (/vue|__VUE/i.test(content)) analysis.framework.push('Vue');
            if (/_sharedData/.test(content)) analysis.framework.push('Instagram JS');
            
            comparison.push(analysis);
        });
        
        const comparisonText = comparison.map(item => 
            `**${item.filename}**\n` +
            `Size: ${item.size}\n` +
            `SharedData: ${item.hasSharedData ? '✅' : '❌'}\n` +
            `Live keywords: ${item.liveKeywords}\n` +
            `User data: ${item.hasUserData ? '✅' : '❌'}\n` +
            `Framework: ${item.framework.join(', ') || 'None'}`
        ).join('\n\n');
        
        await message.reply(`📊 **File Comparison:**\n${comparisonText}`);
        
    } catch (error) {
        await message.reply(`❌ Error comparing files: ${error.message}`);
    }
}

// 輔助函數：將字符串分段
function chunkString(str, size) {
    const chunks = [];
    for (let i = 0; i < str.length; i += size) {
        chunks.push(str.slice(i, i + size));
    }
    return chunks;
}

// 需要從 html-analyzer.js 導入的函數
const { analyzeHTMLContent } = require('./html-analyzer.js');

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    
    if (content === '!status') {
        const status = isLiveNow ? '🔴 LIVE' : '⚫ Offline';
        const sessionStatus = sessionData.hasValidSession ? '✅ Logged in' : '❌ Not logged in';
        await message.reply(`📊 **Monitor Status**\n**Target:** @${TARGET_USERNAME}\n**Status:** ${status}\n**Session:** ${sessionStatus}`);
    }
    
    if (content === '!check') {
        await message.reply('🔍 Performing manual check...');
        try {
            const result = await checkLiveStatusWithComparison();
            const status = result ? '🔴 LIVE' : '⚫ Offline';
            await message.reply(`📊 Manual check result: ${status}`);
        } catch (error) {
            await message.reply(`❌ Check failed: ${error.message}`);
        }
    }
    
    if (content === '!analyze') {
        await message.reply('🔍 Running HTML analysis...');
        try {
            await analyzeLatestHTMLFiles();
            await message.reply('✅ Analysis complete! Check logs for details.');
        } catch (error) {
            await message.reply(`❌ Analysis failed: ${error.message}`);
        }
    }
    
    if (content === '!ping') {
        const ping = Date.now() - message.createdTimestamp;
        await message.reply(`🏓 Pong! Latency: ${ping}ms`);
    }
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('Environment variables check:');
    console.log('- DISCORD_TOKEN:', DISCORD_TOKEN ? 'Set' : 'Missing');
    console.log('- DISCORD_CHANNEL_ID:', DISCORD_CHANNEL_ID || 'Missing');
    console.log('- TARGET_USERNAME:', TARGET_USERNAME || 'Missing');
    console.log('- IG_SESSION_ID:', IG_SESSION_ID ? 'Set' : 'Missing');
    console.log('- IG_CSRF_TOKEN:', IG_CSRF_TOKEN ? 'Set' : 'Missing');
    console.log('- IG_DS_USER_ID:', IG_DS_USER_ID ? 'Set' : 'Missing');
    
    // 初始化 session
    initializeSession();
    startEnhancedMonitoring();
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

function initializeSession() {
    if (IG_SESSION_ID && IG_CSRF_TOKEN && IG_DS_USER_ID) {
        sessionData.cookies = `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}; mid=ZnH2YAAEAAFONwllOTI_7qW3kJMY; ig_cb=2`;
        sessionData.hasValidSession = true;
        console.log('✅ Instagram session initialized with cookies');
    } else {
        console.log('⚠️ No Instagram cookies provided - will use anonymous access');
        sessionData.hasValidSession = false;
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
        const timestamp = Date.now();
        const filepath = path.join(__dirname, 'debug-files', `${filename}_${timestamp}.html`);
        
        // 確保目錄存在
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filepath, html, 'utf8');
        console.log(`📁 HTML saved to: ${filepath}`);
        
        // 也創建一個簡化版本用於 Discord 分享
        const summary = createHTMLSummary(html, filename);
        const summaryPath = path.join(__dirname, 'debug-files', `${filename}_${timestamp}_summary.txt`);
        fs.writeFileSync(summaryPath, summary, 'utf8');
        
        return { fullPath: filepath, summaryPath: summaryPath, summary: summary };
    } catch (error) {
        console.error('❌ Failed to save HTML:', error);
        return null;
    }
}

// 創建 HTML 摘要
function createHTMLSummary(html, source) {
    const summary = [];
    summary.push(`=== HTML Analysis Summary for ${source} ===`);
    summary.push(`File size: ${html.length} characters`);
    summary.push(`Timestamp: ${new Date().toISOString()}`);
    summary.push('');
    
    // 檢查框架
    const frameworks = [];
    if (/react|__REACT/i.test(html)) frameworks.push('React');
    if (/vue|__VUE/i.test(html)) frameworks.push('Vue');
    if (/_sharedData|InstagramWebDesktopFBWWW/i.test(html)) frameworks.push('Instagram JS');
    
    summary.push(`Frameworks detected: ${frameworks.join(', ') || 'None'}`);
    summary.push('');
    
    // 檢查直播關鍵詞
    const liveKeywords = ['直播', 'LIVE', 'Live', 'live', 'broadcast', 'streaming'];
    const foundKeywords = [];
    
    liveKeywords.forEach(keyword => {
        const matches = (html.match(new RegExp(keyword, 'gi')) || []).length;
        if (matches > 0) {
            foundKeywords.push(`${keyword}: ${matches}`);
        }
    });
    
    summary.push(`Live keywords found: ${foundKeywords.join(', ') || 'None'}`);
    summary.push('');
    
    // 檢查 _sharedData
    const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});/s);
    if (sharedDataMatch) {
        try {
            const sharedData = JSON.parse(sharedDataMatch[1]);
            summary.push('✅ window._sharedData found');
            
            const profilePage = sharedData?.entry_data?.ProfilePage?.[0];
            if (profilePage?.graphql?.user) {
                const user = profilePage.graphql.user;
                summary.push(`User: ${user.username || 'unknown'}`);
                summary.push(`User keys: ${Object.keys(user).slice(0, 10).join(', ')}...`);
            }
        } catch (e) {
            summary.push('❌ Failed to parse _sharedData');
        }
    } else {
        summary.push('❌ No window._sharedData found');
    }
    
    return summary.join('\n');
}

// 增強的檢測函數
function checkHTMLForLiveStatus(html) {
    console.log('\n🔍 === Enhanced Live Detection Analysis ===');
    
    let liveIndicators = [];
    
    // Method 1: 更廣泛的關鍵詞檢測
    const liveKeywords = [
        '直播', '正在直播', '現在直播', '直播中',
        'LIVE', 'Live', 'live', 'Live now', 'Going live', 'Now live',
        'En vivo', 'En directo', 'Live stream', 'Broadcasting'
    ];
    
    console.log('📝 Keyword detection:');
    liveKeywords.forEach(keyword => {
        const regex = new RegExp(keyword, 'gi');
        const matches = html.match(regex);
        if (matches) {
            liveIndicators.push(`keyword:${keyword}(${matches.length})`);
            console.log(`   ✅ "${keyword}": ${matches.length} matches`);
        }
    });
    
    // Method 2: 檢查 JSON 數據
    console.log('\n📦 JSON data analysis:');
    const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});/s);
    if (sharedDataMatch) {
        try {
            const sharedData = JSON.parse(sharedDataMatch[1]);
            const user = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user;
            
            if (user) {
                // 檢查直播相關字段
                const liveFields = ['is_live', 'live_broadcast_id', 'broadcast_id'];
                liveFields.forEach(field => {
                    if (user[field] === true || (user[field] && user[field] !== null && user[field] !== '')) {
                        liveIndicators.push(`json:${field}=${user[field]}`);
                        console.log(`   🔴 Found ${field}: ${user[field]}`);
                    }
                });
                
                // 檢查 timeline media
                if (user.edge_owner_to_timeline_media?.edges) {
                    for (const edge of user.edge_owner_to_timeline_media.edges) {
                        if (edge.node?.media_type === 4) { // Live video type
                            liveIndicators.push('json:media_type=4');
                            console.log('   🔴 Found live video in timeline');
                        }
                    }
                }
            }
        } catch (e) {
            console.log(`   ❌ Failed to parse JSON: ${e.message}`);
        }
    }
    
    // Method 3: 檢查 HTML 結構
    const liveClassPatterns = [
        /class="[^"]*live[^"]*"/gi,
        /aria-label="[^"]*live[^"]*"/gi,
        /aria-label="[^"]*直播[^"]*"/gi
    ];
    
    liveClassPatterns.forEach((pattern, idx) => {
        const matches = html.match(pattern);
        if (matches) {
            liveIndicators.push(`html:pattern${idx}(${matches.length})`);
            console.log(`   ✅ Found live HTML pattern ${idx}: ${matches.length} matches`);
        }
    });
    
    // 決定結果
    const isLive = liveIndicators.length > 0;
    console.log(`\n📊 Final decision: ${isLive ? '🔴 LIVE DETECTED' : '⚫ No live indicators found'}`);
    if (liveIndicators.length > 0) {
        console.log(`   Indicators: ${liveIndicators.join(', ')}`);
    }
    
    return isLive;
}

// 多方法對比檢測
async function checkLiveStatusWithComparison() {
    const timestamp = new Date().toISOString();
    console.log(`\n🔍 === Multi-method Live Status Check (${timestamp}) ===`);
    
    const results = {};
    
    // 方法 1: 匿名請求
    try {
        console.log('\n🌐 Method 1: Anonymous request');
        const anonymousResponse = await makeRequest(`https://www.instagram.com/${TARGET_USERNAME}/`, {
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
        
        const anonymousFile = await saveHTMLForAnalysis(anonymousResponse.data, 'anonymous');
        results.anonymous = checkHTMLForLiveStatus(anonymousResponse.data);
        
        // 發送摘要到 Discord (如果檔案不太大)
        if (anonymousFile && anonymousFile.summary.length < 1500) {
            await sendDiscordMessage(`📊 **Anonymous Request Analysis**\n\`\`\`\n${anonymousFile.summary}\n\`\`\``);
        }
        
    } catch (error) {
        console.error('❌ Anonymous request failed:', error);
        results.anonymous = false;
    }
    
    // 方法 2: 使用 cookies 的登錄請求 (如果有)
    if (sessionData.hasValidSession) {
        try {
            console.log('\n🌐 Method 2: Authenticated request');
            const authResponse = await makeRequest(`https://www.instagram.com/${TARGET_USERNAME}/`, {
                method: 'GET',
                headers: {
                    'User-Agent': sessionData.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cookie': sessionData.cookies,
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0',
                    'Upgrade-Insecure-Requests': '1',
                    'Connection': 'keep-alive'
                }
            });
            
            const authFile = await saveHTMLForAnalysis(authResponse.data, 'authenticated');
            results.authenticated = checkHTMLForLiveStatus(authResponse.data);
            
            // 發送摘要到 Discord
            if (authFile && authFile.summary.length < 1500) {
                await sendDiscordMessage(`📊 **Authenticated Request Analysis**\n\`\`\`\n${authFile.summary}\n\`\`\``);
            }
            
        } catch (error) {
            console.error('❌ Authenticated request failed:', error);
            results.authenticated = false;
        }
    }
    
    // 方法 3: API 嘗試
    try {
        console.log('\n🌐 Method 3: API request');
        const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${TARGET_USERNAME}`;
        
        const apiHeaders = {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `https://www.instagram.com/${TARGET_USERNAME}/`
        };
        
        if (sessionData.hasValidSession) {
            apiHeaders['Cookie'] = sessionData.cookies;
            apiHeaders['X-CSRFToken'] = IG_CSRF_TOKEN;
            apiHeaders['X-IG-App-ID'] = '936619743392459';
        }
        
        const apiResponse = await makeRequest(apiUrl, {
            method: 'GET',
            headers: apiHeaders
        });
        
        if (apiResponse.statusCode === 200) {
            try {
                const apiData = JSON.parse(apiResponse.data);
                results.api = checkAPIForLiveStatus(apiData);
                
                // 保存 API 回應
                const apiFile = await saveHTMLForAnalysis(JSON.stringify(apiData, null, 2), 'api_response');
                console.log('✅ API response saved');
                
            } catch (e) {
                console.log('❌ Failed to parse API response');
                results.api = false;
            }
        } else {
            console.log(`❌ API request failed: ${apiResponse.statusCode}`);
            results.api = false;
        }
        
    } catch (error) {
        console.error('❌ API request failed:', error);
        results.api = false;
    }
    
    // 比較結果
    console.log('\n📊 === Results Comparison ===');
    const resultSummary = [];
    Object.entries(results).forEach(([method, isLive]) => {
        const status = isLive ? '🔴 LIVE' : '⚫ Offline';
        console.log(`   ${method}: ${status}`);
        resultSummary.push(`${method}: ${status}`);
    });
    
    // 發送結果到 Discord
    await sendDiscordMessage(`📊 **Live Status Check Results**\n${resultSummary.join('\n')}\n\n⏰ ${new Date().toLocaleString('zh-TW')}`);
    
    // 如果結果不一致，發送警告
    const uniqueResults = [...new Set(Object.values(results))];
    if (uniqueResults.length > 1) {
        console.log('⚠️ WARNING: Inconsistent results detected!');
        await sendDiscordMessage(`⚠️ **Inconsistent Results Detected!**\nDifferent methods returned different results. Manual verification recommended.`);
    }
    
    // 返回最可能正確的結果 (優先順序: authenticated > api > anonymous)
    return results.authenticated ?? results.api ?? results.anonymous ?? false;
}

function checkAPIForLiveStatus(apiData) {
    console.log('🔍 Checking API data for live status...');
    
    try {
        const user = apiData.data?.user;
        if (!user) {
            console.log('❌ No user data in API response');
            return false;
        }
        
        console.log(`👤 User found: ${user.username}`);
        
        // 檢查直播指標
        const liveFields = ['is_live', 'broadcast', 'live_broadcast_id', 'broadcast_id'];
        for (const field of liveFields) {
            if (user[field] === true || (user[field] && user[field] !== null)) {
                console.log(`🔴 LIVE DETECTED: ${field} = ${user[field]}`);
                return true;
            }
        }
        
        console.log('⚫ No live indicators found in API data');
        return false;
        
    } catch (error) {
        console.error('❌ Error checking API data:', error);
        return false;
    }
}

// 分析最新的 HTML 文件
async function analyzeLatestHTMLFiles() {
    const debugDir = path.join(__dirname, 'debug-files');
    if (!fs.existsSync(debugDir)) {
        console.log('❌ No debug files directory found');
        return;
    }
    
    const files = fs.readdirSync(debugDir)
        .filter(file => file.endsWith('.html'))
        .sort((a, b) => {
            const aTime = fs.statSync(path.join(debugDir, a)).mtime;
            const bTime = fs.statSync(path.join(debugDir, b)).mtime;
            return bTime - aTime;
        });
    
    if (files.length === 0) {
        console.log('❌ No HTML files found for analysis');
        return;
    }
    
    console.log(`🔍 Analyzing ${files.length} HTML files...`);
    
    // 分析最新的幾個文件
    const filesToAnalyze = files.slice(0, 3);
    for (const file of filesToAnalyze) {
        console.log(`\n📋 Analyzing ${file}...`);
        const filepath = path.join(debugDir, file);
        const { analyzeHTMLFile } = require('./html-analyzer.js');
        analyzeHTMLFile(filepath);
    }
}

async function startEnhancedMonitoring() {
    console.log(`🚀 Starting Instagram Live ENHANCED monitoring for @${TARGET_USERNAME}`);
    
    const sessionStatus = sessionData.hasValidSession ? 'with authenticated session' : 'with anonymous access';
    await sendDiscordMessage(`🤖 Instagram Live Monitor started (ENHANCED) for @${TARGET_USERNAME} ${sessionStatus} ✅\n\n🔧 Available commands: !status, !check, !analyze, !ping`);
    
    // 立即執行一次檢查
    console.log('🔎 Performing initial enhanced analysis...');
    try {
        const initialStatus = await checkLiveStatusWithComparison();
        isLiveNow = initialStatus;
        
        if (initialStatus) {
            await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is currently LIVE! 🎥\nhttps://www.instagram.com/${TARGET_USERNAME}/`);
        } else {
            console.log('✅ Initial check complete - not currently live');
        }
    } catch (error) {
        console.error('❌ Initial check failed:', error);
        await sendDiscordMessage(`❌ Initial check failed: ${error.message}`);
    }
    
    // 每 3 分鐘執行一次 (避免太頻繁)
    console.log('⏰ Starting monitoring loop (every 3 minutes)...');
    setInterval(async () => {
        try {
            const currentlyLive = await checkLiveStatusWithComparison();
            
            if (currentlyLive && !isLiveNow) {
                isLiveNow = true;
                console.log('🔴 STATUS CHANGE: User went LIVE!');
                await sendDiscordMessage(`🔴 @${TARGET_USERNAME} is now LIVE on Instagram! 🎥\n\n🔗 https://www.instagram.com/${TARGET_USERNAME}/\n\n⏰ 檢測時間: ${new Date().toLocaleString('zh-TW')}`);
            } else if (!currentlyLive && isLiveNow) {
                isLiveNow = false;
                console.log('⚫ STATUS CHANGE: User went offline');
                await sendDiscordMessage(`⚫ @${TARGET_USERNAME} has ended their Instagram Live stream.\n\n⏰ 結束時間: ${new Date().toLocaleString('zh-TW')}`);
            } else {
                console.log(`📊 Status unchanged: ${currentlyLive ? '🔴 LIVE' : '⚫ Offline'}`);
            }
            
        } catch (error) {
            console.error('❌ Error in monitoring loop:', error);
        }
    }, 3 * 60 * 1000); // 3 minutes
    
    // 心跳每 15 分鐘
    setInterval(() => {
        const sessionInfo = sessionData.hasValidSession ? '🔐 Authenticated' : '👤 Anonymous';
        console.log(`💓 Enhanced monitoring active - @${TARGET_USERNAME} | ${isLiveNow ? '🔴 LIVE' : '⚫ Offline'} | ${sessionInfo} | ${new Date().toLocaleString('zh-TW')}`);
    }, 15 * 60 * 1000);
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

// Handle uncaught errors
process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    try {
        await sendDiscordMessage(`❌ Critical error occurred: ${error.message}`);
    } catch (e) {
        console.error('Failed to send error message to Discord:', e);
    }
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    try {
        await sendDiscordMessage(`⚠️ Unhandled rejection: ${reason}`);
    } catch (e) {
        console.error('Failed to send rejection message to Discord:', e);
    }
});

// Start the bot
client.login(DISCORD_TOKEN);