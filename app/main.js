const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');
const fs = require('fs');
const path = require('path');

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
    cookies: '',
    hasValidSession: false
};

function initializeSession() {
    if (IG_SESSION_ID && IG_CSRF_TOKEN && IG_DS_USER_ID) {
        sessionData.cookies = `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}`;
        sessionData.hasValidSession = true;
        console.log('✅ Instagram session initialized with cookies');
    } else {
        console.log('⚠️ No Instagram cookies provided - will use anonymous access');
        sessionData.hasValidSession = false;
    }
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
                    contentLength: buffer.length
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

async function sendDiscordMessage(message, content = null) {
    try {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        await channel.send(message);
        
        if (content) {
            // 分段發送內容
            const chunks = chunkString(content, 1900);
            for (let i = 0; i < Math.min(chunks.length, 3); i++) {
                await channel.send(`\`\`\`\n${chunks[i]}\n\`\`\``);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            if (chunks.length > 3) {
                await channel.send(`... (還有 ${chunks.length - 3} 段內容被省略)`);
            }
        }
    } catch (error) {
        console.error('Failed to send Discord message:', error);
    }
}

function chunkString(str, size) {
    const chunks = [];
    for (let i = 0; i < str.length; i += size) {
        chunks.push(str.slice(i, i + size));
    }
    return chunks;
}

// 簡單的內容分析
function analyzeContent(content, method) {
    console.log(`\n🔍 === Analyzing ${method} Response ===`);
    console.log(`📊 Content length: ${content.length} characters`);
    
    const analysis = {
        method: method,
        size: content.length,
        hasHTML: /<html/i.test(content),
        isJSON: false,
        hasSharedData: /_sharedData/.test(content),
        liveKeywords: 0,
        frameworks: [],
        errors: []
    };
    
    // 檢查是否為 JSON
    try {
        JSON.parse(content);
        analysis.isJSON = true;
        console.log('✅ Content is valid JSON');
    } catch (e) {
        console.log('📄 Content appears to be HTML/text');
    }
    
    // 檢查框架
    if (/react|__REACT/i.test(content)) analysis.frameworks.push('React');
    if (/vue|__VUE/i.test(content)) analysis.frameworks.push('Vue');
    if (/_sharedData/.test(content)) analysis.frameworks.push('Instagram JS');
    
    // 檢查直播關鍵詞
    const liveKeywords = ['直播', 'LIVE', 'Live', 'live', 'broadcast', 'streaming'];
    liveKeywords.forEach(keyword => {
        const matches = (content.match(new RegExp(keyword, 'gi')) || []).length;
        analysis.liveKeywords += matches;
    });
    
    // 檢查錯誤信息
    if (/error|Error|ERROR/.test(content)) {
        const errorMatches = content.match(/error[^"]*["'][^"']*["']/gi) || [];
        analysis.errors = errorMatches.slice(0, 3);
    }
    
    console.log(`📊 Analysis results:`);
    console.log(`   - Size: ${analysis.size} chars`);
    console.log(`   - Format: ${analysis.isJSON ? 'JSON' : 'HTML/Text'}`);
    console.log(`   - Has SharedData: ${analysis.hasSharedData ? 'Yes' : 'No'}`);
    console.log(`   - Live keywords: ${analysis.liveKeywords}`);
    console.log(`   - Frameworks: ${analysis.frameworks.join(', ') || 'None'}`);
    console.log(`   - Errors: ${analysis.errors.length}`);
    
    return analysis;
}

// 主要測試函數
async function testInstagramRequests() {
    console.log(`\n🧪 === Testing Instagram Requests for @${TARGET_USERNAME} ===`);
    
    const tests = [];
    
    // Test 1: 基本匿名請求
    try {
        console.log('\n🌐 Test 1: Basic Anonymous Request');
        const response1 = await makeRequest(`https://www.instagram.com/${TARGET_USERNAME}/`, {
            method: 'GET',
            headers: {
                'User-Agent': sessionData.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive'
            }
        });
        
        console.log(`   Status: ${response1.statusCode}`);
        const analysis1 = analyzeContent(response1.data, 'Anonymous');
        tests.push(analysis1);
        
        // 發送結果到 Discord
        const summary1 = `📊 **Anonymous Request Result:**
Status: ${response1.statusCode}
Size: ${analysis1.size} chars
Format: ${analysis1.isJSON ? 'JSON' : 'HTML'}
SharedData: ${analysis1.hasSharedData ? 'Yes' : 'No'}
Live keywords: ${analysis1.liveKeywords}
Frameworks: ${analysis1.frameworks.join(', ') || 'None'}`;
        
        await sendDiscordMessage(summary1);
        
        // 如果內容很小，顯示全部
        if (response1.data.length < 2000) {
            await sendDiscordMessage('📄 **Full content:**', response1.data);
        } else {
            // 顯示開頭部分
            await sendDiscordMessage('📄 **Content preview (first 1500 chars):**', response1.data.substring(0, 1500));
        }
        
    } catch (error) {
        console.error('❌ Anonymous request failed:', error);
        await sendDiscordMessage(`❌ Anonymous request failed: ${error.message}`);
    }
    
    // Test 2: 使用 cookies 的認證請求
    if (sessionData.hasValidSession) {
        try {
            console.log('\n🌐 Test 2: Authenticated Request');
            const response2 = await makeRequest(`https://www.instagram.com/${TARGET_USERNAME}/`, {
                method: 'GET',
                headers: {
                    'User-Agent': sessionData.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Cookie': sessionData.cookies,
                    'Connection': 'keep-alive'
                }
            });
            
            console.log(`   Status: ${response2.statusCode}`);
            const analysis2 = analyzeContent(response2.data, 'Authenticated');
            tests.push(analysis2);
            
            const summary2 = `📊 **Authenticated Request Result:**
Status: ${response2.statusCode}
Size: ${analysis2.size} chars
Format: ${analysis2.isJSON ? 'JSON' : 'HTML'}
SharedData: ${analysis2.hasSharedData ? 'Yes' : 'No'}
Live keywords: ${analysis2.liveKeywords}
Frameworks: ${analysis2.frameworks.join(', ') || 'None'}`;
            
            await sendDiscordMessage(summary2);
            
            if (response2.data.length < 2000) {
                await sendDiscordMessage('📄 **Full authenticated content:**', response2.data);
            } else {
                await sendDiscordMessage('📄 **Authenticated content preview:**', response2.data.substring(0, 1500));
            }
            
        } catch (error) {
            console.error('❌ Authenticated request failed:', error);
            await sendDiscordMessage(`❌ Authenticated request failed: ${error.message}`);
        }
    }
    
    // Test 3: API 請求
    try {
        console.log('\n🌐 Test 3: API Request');
        const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${TARGET_USERNAME}`;
        
        const apiHeaders = {
            'User-Agent': sessionData.userAgent,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `https://www.instagram.com/${TARGET_USERNAME}/`
        };
        
        if (sessionData.hasValidSession) {
            apiHeaders['Cookie'] = sessionData.cookies;
            apiHeaders['X-CSRFToken'] = IG_CSRF_TOKEN;
        }
        
        const response3 = await makeRequest(apiUrl, {
            method: 'GET',
            headers: apiHeaders
        });
        
        console.log(`   Status: ${response3.statusCode}`);
        const analysis3 = analyzeContent(response3.data, 'API');
        tests.push(analysis3);
        
        const summary3 = `📊 **API Request Result:**
Status: ${response3.statusCode}
Size: ${analysis3.size} chars
Format: ${analysis3.isJSON ? 'JSON' : 'HTML'}
Live keywords: ${analysis3.liveKeywords}`;
        
        await sendDiscordMessage(summary3);
        await sendDiscordMessage('📄 **API Response:**', response3.data);
        
    } catch (error) {
        console.error('❌ API request failed:', error);
        await sendDiscordMessage(`❌ API request failed: ${error.message}`);
    }
    
    // 比較結果
    console.log('\n📊 === Test Summary ===');
    tests.forEach(test => {
        console.log(`${test.method}: ${test.size} chars, ${test.isJSON ? 'JSON' : 'HTML'}, Live keywords: ${test.liveKeywords}`);
    });
    
    const comparison = tests.map(test => 
        `${test.method}: ${test.size} chars, ${test.isJSON ? 'JSON' : 'HTML'}, Live: ${test.liveKeywords}`
    ).join('\n');
    
    await sendDiscordMessage(`📊 **Comparison Summary:**\n\`\`\`\n${comparison}\n\`\`\``);
}

// Discord 命令處理
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    
    if (content === '!test') {
        await message.reply('🧪 Starting Instagram content test...');
        await testInstagramRequests();
        await message.reply('✅ Test completed!');
    }
    
    if (content === '!status') {
        const sessionStatus = sessionData.hasValidSession ? '✅ With cookies' : '❌ Anonymous only';
        await message.reply(`📊 **Simple Tester Status**\nTarget: @${TARGET_USERNAME}\nSession: ${sessionStatus}\n\n💡 Use \`!test\` to analyze Instagram responses`);
    }
    
    if (content === '!help') {
        await message.reply(`🤖 **Simple Instagram Tester**\n\n\`!test\` - Run content analysis\n\`!status\` - Check status\n\`!help\` - Show this help`);
    }
});

client.once('ready', () => {
    console.log(`✅ Simple tester logged in as ${client.user.tag}!`);
    initializeSession();
    sendDiscordMessage(`🧪 **Simple Instagram Tester Ready**\nTarget: @${TARGET_USERNAME}\nSession: ${sessionData.hasValidSession ? 'Authenticated' : 'Anonymous'}\n\n💡 Use \`!test\` to start analysis`);
});

// Start the bot
client.login(DISCORD_TOKEN);