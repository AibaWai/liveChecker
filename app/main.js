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

// 添加到你的 main.js 中的新檢測方法

// 嘗試多個 Instagram API 端點
async function checkInstagramAlternativeAPIs(username) {
    console.log('\n🌐 === Trying Alternative Instagram APIs ===');
    
    const endpoints = [
        // 1. Stories API
        {
            url: `https://www.instagram.com/api/v1/feed/reels_media/?target_user_id=${username}`,
            name: 'stories_api'
        },
        // 2. User info (移動端)
        {
            url: `https://i.instagram.com/api/v1/users/${username}/info/`,
            name: 'mobile_user_info'
        },
        // 3. 另一個 profile API
        {
            url: `https://www.instagram.com/${username}/?__a=1&__d=dis`,
            name: 'profile_api_alt'
        },
        // 4. Stories 頁面
        {
            url: `https://www.instagram.com/stories/${username}/`,
            name: 'stories_page'
        },
        // 5. Feed API
        {
            url: `https://www.instagram.com/api/v1/feed/user/${username}/`,
            name: 'feed_api'
        }
    ];
    
    const results = {};
    
    for (let i = 0; i < endpoints.length; i++) {
        const endpoint = endpoints[i];
        
        try {
            console.log(`🔍 Trying ${endpoint.name}: ${endpoint.url}`);
            
            const apiHeaders = {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': `https://www.instagram.com/${username}/`,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            };
            
            if (sessionData.hasValidSession) {
                apiHeaders['Cookie'] = sessionData.cookies;
                apiHeaders['X-CSRFToken'] = IG_CSRF_TOKEN;
                apiHeaders['X-IG-App-ID'] = '936619743392459';
            }
            
            const response = await makeRequest(endpoint.url, {
                method: 'GET',
                headers: apiHeaders
            });
            
            console.log(`   Status: ${response.statusCode}`);
            
            if (response.statusCode === 200) {
                console.log(`   ✅ Success! Response length: ${response.data.length}`);
                
                // 保存回應
                await saveHTMLForAnalysis(response.data, `alt_${endpoint.name}`);
                
                try {
                    const jsonData = JSON.parse(response.data);
                    const liveFound = checkAnyLiveIndicators(jsonData, endpoint.name);
                    results[endpoint.name] = liveFound;
                    
                    if (liveFound) {
                        console.log(`   🔴 LIVE DETECTED in ${endpoint.name}!`);
                        await sendDiscordMessage(`🔴 **Live detected in ${endpoint.name}!**\nEndpoint: ${endpoint.url}`);
                    }
                    
                } catch (e) {
                    console.log(`   ⚠️ Not JSON format, checking as HTML...`);
                    const htmlLive = checkHTMLForLiveStatus(response.data);
                    results[endpoint.name] = htmlLive;
                    
                    if (htmlLive) {
                        console.log(`   🔴 LIVE DETECTED in ${endpoint.name} HTML!`);
                        await sendDiscordMessage(`🔴 **Live detected in ${endpoint.name} HTML!**\nEndpoint: ${endpoint.url}`);
                    }
                }
                
            } else if (response.statusCode === 429) {
                console.log(`   ⏸️ Rate limited, waiting...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                results[endpoint.name] = false;
            } else {
                console.log(`   ❌ Failed: ${response.statusCode}`);
                results[endpoint.name] = false;
            }
            
        } catch (error) {
            console.log(`   ❌ Error in ${endpoint.name}: ${error.message}`);
            results[endpoint.name] = false;
        }
        
        // 避免太快的請求
        if (i < endpoints.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('\n📊 === Alternative API Results ===');
    Object.entries(results).forEach(([api, isLive]) => {
        console.log(`   ${api}: ${isLive ? '🔴 LIVE' : '⚫ Offline'}`);
    });
    
    // 發送結果到 Discord
    const apiSummary = Object.entries(results)
        .map(([api, isLive]) => `${api}: ${isLive ? '🔴 LIVE' : '⚫ Offline'}`)
        .join('\n');
    
    await sendDiscordMessage(`📊 **Alternative API Results:**\n\`\`\`\n${apiSummary}\n\`\`\``);
    
    return Object.values(results).some(result => result === true);
}

// 更全面的直播指標檢查
function checkAnyLiveIndicators(data, source = 'unknown') {
    console.log(`🔍 Checking live indicators in ${source}...`);
    
    try {
        const dataStr = JSON.stringify(data).toLowerCase();
        
        // 檢查關鍵詞
        const liveKeywords = [
            'is_live', 'islive', 'live_broadcast', 'broadcast_id', 
            'live_stream', 'streaming', 'broadcast_status',
            'live_video', 'video_call', 'going_live',
            'live_viewer_count', 'live_comment_count',
            'broadcast_owner', 'live_url'
        ];
        
        const foundKeywords = [];
        liveKeywords.forEach(keyword => {
            if (dataStr.includes(keyword)) {
                foundKeywords.push(keyword);
                console.log(`   ✅ Found keyword: ${keyword}`);
            }
        });
        
        // 遞迴檢查對象
        const liveFields = findLiveFieldsRecursive(data);
        if (liveFields.length > 0) {
            console.log(`   🔴 Found live fields:`);
            liveFields.forEach(field => {
                console.log(`      ${field.path}: ${field.value}`);
            });
        }
        
        // 檢查特定結構
        const hasLiveContent = checkLiveContent(data);
        if (hasLiveContent) {
            console.log(`   🔴 Found live content structure`);
        }
        
        const hasLiveIndicators = foundKeywords.length > 0 || liveFields.length > 0 || hasLiveContent;
        
        if (hasLiveIndicators) {
            console.log(`   🎯 ${source}: LIVE indicators found!`);
        } else {
            console.log(`   ⚫ ${source}: No live indicators`);
        }
        
        return hasLiveIndicators;
        
    } catch (error) {
        console.error(`❌ Error checking live indicators in ${source}:`, error);
        return false;
    }
}

// 檢查直播內容結構
function checkLiveContent(data) {
    try {
        // 檢查 stories 中的直播
        if (data.reels_media) {
            for (const reel of data.reels_media) {
                if (reel.items) {
                    for (const item of reel.items) {
                        if (item.media_type === 4 || item.is_live === true) {
                            return true;
                        }
                    }
                }
            }
        }
        
        // 檢查 feed 中的直播
        if (data.items) {
            for (const item of data.items) {
                if (item.media_type === 4 || item.is_live === true) {
                    return true;
                }
            }
        }
        
        // 檢查 user 數據中的直播
        if (data.user) {
            const user = data.user;
            if (user.is_live === true || user.live_broadcast_id || user.broadcast_id) {
                return true;
            }
        }
        
        // 檢查 GraphQL 結構
        if (data.data && data.data.user) {
            const user = data.data.user;
            if (user.is_live === true || user.live_broadcast_id) {
                return true;
            }
        }
        
        return false;
        
    } catch (error) {
        console.log(`   ⚠️ Error checking live content: ${error.message}`);
        return false;
    }
}

// 更深層的遞迴搜尋
function findLiveFieldsRecursive(obj, path = '', maxDepth = 6, currentDepth = 0) {
    if (currentDepth > maxDepth || !obj || typeof obj !== 'object') {
        return [];
    }
    
    const liveFields = [];
    const liveKeywords = [
        'is_live', 'islive', 'live', 'broadcast', 'streaming',
        'live_broadcast_id', 'broadcast_id', 'live_status',
        'live_stream', 'is_broadcasting', 'broadcast_status',
        'live_viewer_count', 'live_url', 'stream_url'
    ];
    
    try {
        if (Array.isArray(obj)) {
            obj.forEach((item, index) => {
                const arrayPath = path ? `${path}[${index}]` : `[${index}]`;
                liveFields.push(...findLiveFieldsRecursive(item, arrayPath, maxDepth, currentDepth + 1));
            });
        } else {
            for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? `${path}.${key}` : key;
                
                // 檢查 key 是否包含直播相關詞彙
                if (liveKeywords.some(keyword => key.toLowerCase().includes(keyword.toLowerCase()))) {
                    liveFields.push({ path: currentPath, value: value });
                }
                
                // 檢查 value 是否為 true 且 key 可能與直播相關
                if (value === true && /live|broadcast|stream/i.test(key)) {
                    liveFields.push({ path: currentPath, value: value });
                }
                
                // 遞迴檢查嵌套對象
                if (typeof value === 'object' && value !== null) {
                    liveFields.push(...findLiveFieldsRecursive(value, currentPath, maxDepth, currentDepth + 1));
                }
            }
        }
    } catch (error) {
        console.log(`   ⚠️ Error in recursive search at ${path}: ${error.message}`);
    }
    
    return liveFields;
}

// 添加新的 Discord 命令
client.on('messageCreate', async (message) => {
    // ... 現有命令 ...
    
    if (content === '!altapi') {
        await message.reply('🔍 Testing alternative Instagram APIs...');
        try {
            const result = await checkInstagramAlternativeAPIs(TARGET_USERNAME);
            const status = result ? '🔴 LIVE' : '⚫ Offline';
            await message.reply(`📊 Alternative API check result: ${status}`);
        } catch (error) {
            await message.reply(`❌ Alternative API check failed: ${error.message}`);
        }
    }
    
    if (content === '!deepcheck') {
        await message.reply('🔍 Performing deep live status check...');
        try {
            // 組合所有方法
            const standardResult = await checkLiveStatusWithComparison();
            const altApiResult = await checkInstagramAlternativeAPIs(TARGET_USERNAME);
            
            const finalResult = standardResult || altApiResult;
            const status = finalResult ? '🔴 LIVE DETECTED' : '⚫ Not Live';
            
            await message.reply(`🎯 **Deep Check Result:** ${status}\n` +
                `Standard APIs: ${standardResult ? '🔴' : '⚫'}\n` +
                `Alternative APIs: ${altApiResult ? '🔴' : '⚫'}`);
                
        } catch (error) {
            await message.reply(`❌ Deep check failed: ${error.message}`);
        }
    }
});

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

// 替換你的 client.on('messageCreate') 部分

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase(); // 確保這行在最前面
    
    try {
        // 原有命令
        if (content === '!status') {
            const status = isLiveNow ? '🔴 LIVE' : '⚫ Offline';
            const sessionStatus = sessionData.hasValidSession ? '✅ Logged in' : '❌ Not logged in';
            await message.reply(`📊 **Monitor Status**\n**Target:** @${TARGET_USERNAME}\n**Status:** ${status}\n**Session:** ${sessionStatus}`);
        }
        
        else if (content === '!check') {
            await message.reply('🔍 Performing manual check...');
            const result = await checkLiveStatusWithComparison();
            const status = result ? '🔴 LIVE' : '⚫ Offline';
            await message.reply(`📊 Manual check result: ${status}`);
        }
        
        else if (content === '!analyze') {
            await message.reply('🔍 Running HTML analysis...');
            await analyzeLatestHTMLFiles();
            await message.reply('✅ Analysis complete! Check logs for details.');
        }
        
        else if (content === '!ping') {
            const ping = Date.now() - message.createdTimestamp;
            await message.reply(`🏓 Pong! Latency: ${ping}ms`);
        }
        
        // 文件相關命令
        else if (content === '!files') {
            await listDebugFiles(message);
        }
        
        else if (content.startsWith('!export ')) {
            const filename = content.replace('!export ', '').trim();
            await exportFile(message, filename);
        }
        
        else if (content === '!latest') {
            await exportLatestFiles(message);
        }
        
        else if (content === '!api') {
            await exportLatestAPIResponse(message);
        }
        
        else if (content === '!compare') {
            await compareLatestFiles(message);
        }
        
        // 新的 API 測試命令
        else if (content === '!altapi') {
            await message.reply('🔍 Testing alternative Instagram APIs...');
            const result = await checkInstagramAlternativeAPIs(TARGET_USERNAME);
            const status = result ? '🔴 LIVE' : '⚫ Offline';
            await message.reply(`📊 Alternative API check result: ${status}`);
        }
        
        else if (content === '!deepcheck') {
            await message.reply('🔍 Performing deep live status check...');
            // 組合所有方法
            const standardResult = await checkLiveStatusWithComparison();
            const altApiResult = await checkInstagramAlternativeAPIs(TARGET_USERNAME);
            
            const finalResult = standardResult || altApiResult;
            const status = finalResult ? '🔴 LIVE DETECTED' : '⚫ Not Live';
            
            await message.reply(`🎯 **Deep Check Result:** ${status}\n` +
                `Standard APIs: ${standardResult ? '🔴' : '⚫'}\n` +
                `Alternative APIs: ${altApiResult ? '🔴' : '⚫'}`);
        }
        
        // 幫助命令
        else if (content === '!help') {
            const helpText = `🤖 **Instagram Live Monitor Commands:**
            
**Basic Commands:**
\`!status\` - 查看監控狀態
\`!check\` - 手動檢查直播狀態
\`!ping\` - 檢查機器人延遲

**File Commands:**
\`!files\` - 列出調試文件
\`!latest\` - 導出最新文件
\`!api\` - 導出最新API回應
\`!export filename\` - 導出指定文件
\`!compare\` - 比較文件差異

**Advanced Commands:**
\`!analyze\` - 分析HTML文件
\`!altapi\` - 測試替代API
\`!deepcheck\` - 深度檢查
\`!help\` - 顯示此幫助`;
            
            await message.reply(helpText);
        }
        
    } catch (error) {
        console.error('❌ Discord command error:', error);
        await message.reply(`❌ Command failed: ${error.message}`);
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