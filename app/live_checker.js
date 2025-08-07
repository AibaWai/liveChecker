const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 設定檔案
const CONFIG = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN, // Discord Bot Token
    CHANNEL_ID: process.env.CHANNEL_ID, // Discord頻道ID
    INSTAGRAM_USERNAME: process.env.INSTAGRAM_USERNAME, // 要監控的IG用戶名
    INSTAGRAM_COOKIES: process.env.INSTAGRAM_COOKIES, // Instagram Cookies (可選)
    CHECK_INTERVAL: 60000, // 檢查間隔（毫秒）
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

// Discord客戶端
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// 儲存上次檢查狀態
let lastStatus = {
    isLive: false,
    liveId: null
};

// 儲存狀態到檔案
function saveStatus(status) {
    try {
        fs.writeFileSync('status.json', JSON.stringify(status, null, 2));
    } catch (error) {
        console.error('保存狀態失敗:', error);
    }
}

// 從檔案讀取狀態
function loadStatus() {
    try {
        if (fs.existsSync('status.json')) {
            return JSON.parse(fs.readFileSync('status.json', 'utf8'));
        }
    } catch (error) {
        console.error('讀取狀態失敗:', error);
    }
    return { isLive: false, liveId: null };
}

// 獲取Instagram用戶資訊
async function getInstagramUserInfo(username) {
    try {
        const headers = {
            'User-Agent': CONFIG.USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        };

        if (CONFIG.INSTAGRAM_COOKIES) {
            headers['Cookie'] = CONFIG.INSTAGRAM_COOKIES;
        }

        const response = await axios.get(`https://www.instagram.com/${username}/`, {
            headers: headers,
            timeout: 10000
        });

        // 從HTML中提取JSON數據
        const html = response.data;
        const match = html.match(/window\._sharedData\s*=\s*({.+?});/);
        
        if (match) {
            const data = JSON.parse(match[1]);
            const userInfo = data.entry_data?.ProfilePage?.[0]?.graphql?.user;
            return userInfo;
        }

        // 嘗試另一種方式提取數據
        const scriptMatch = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/);
        if (scriptMatch) {
            const jsonData = JSON.parse(scriptMatch[1]);
            return jsonData;
        }

        return null;
    } catch (error) {
        console.error('獲取Instagram用戶資訊失敗:', error.message);
        return null;
    }
}

// 檢查直播狀態的替代方法
async function checkLiveStatusAlternative(username) {
    try {
        // 使用公開API或網頁抓取
        const response = await axios.get(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
            headers: {
                'User-Agent': CONFIG.USER_AGENT,
                'X-IG-App-ID': '936619743392459', // Instagram Web App ID
                'X-ASBD-ID': '198387',
                'X-IG-WWW-Claim': '0',
                'X-Requested-With': 'XMLHttpRequest',
            },
            timeout: 10000
        });

        const userData = response.data?.data?.user;
        if (userData && userData.is_live) {
            return {
                isLive: true,
                liveId: userData.live_broadcast_id || Date.now().toString(),
                username: userData.username,
                fullName: userData.full_name,
                profilePicUrl: userData.profile_pic_url
            };
        }

        return { isLive: false };
    } catch (error) {
        console.error('檢查直播狀態失敗:', error.message);
        return { isLive: false };
    }
}

// 發送Discord通知
async function sendDiscordNotification(liveInfo) {
    try {
        const channel = client.channels.cache.get(CONFIG.CHANNEL_ID);
        if (!channel) {
            console.error('找不到指定的Discord頻道');
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0xFF0080) // Instagram品牌色
            .setTitle('🔴 Instagram直播通知')
            .setDescription(`**${liveInfo.fullName || liveInfo.username}** 開始直播了！`)
            .addFields(
                { name: '用戶名', value: `@${liveInfo.username}`, inline: true },
                { name: '狀態', value: '🔴 直播中', inline: true }
            )
            .setURL(`https://www.instagram.com/${liveInfo.username}/`)
            .setTimestamp()
            .setFooter({ text: 'Instagram直播監控機器人' });

        if (liveInfo.profilePicUrl) {
            embed.setThumbnail(liveInfo.profilePicUrl);
        }

        await channel.send({ 
            content: `@everyone ${liveInfo.fullName || liveInfo.username} 開始直播了！`,
            embeds: [embed] 
        });

        console.log(`✅ 直播通知已發送: ${liveInfo.username}`);
    } catch (error) {
        console.error('發送Discord通知失敗:', error);
    }
}

// 主監控函數
async function monitorInstagramLive() {
    try {
        console.log(`🔍 檢查 @${CONFIG.INSTAGRAM_USERNAME} 的直播狀態...`);
        
        const liveStatus = await checkLiveStatusAlternative(CONFIG.INSTAGRAM_USERNAME);
        
        // 如果開始直播且之前不是直播狀態
        if (liveStatus.isLive && !lastStatus.isLive) {
            console.log(`🔴 檢測到 @${CONFIG.INSTAGRAM_USERNAME} 開始直播！`);
            await sendDiscordNotification(liveStatus);
            lastStatus = {
                isLive: true,
                liveId: liveStatus.liveId
            };
            saveStatus(lastStatus);
        }
        // 如果結束直播
        else if (!liveStatus.isLive && lastStatus.isLive) {
            console.log(`⚫ @${CONFIG.INSTAGRAM_USERNAME} 結束直播`);
            lastStatus = {
                isLive: false,
                liveId: null
            };
            saveStatus(lastStatus);
        }
        // 如果狀態沒有改變
        else if (liveStatus.isLive && lastStatus.isLive) {
            console.log(`🔴 @${CONFIG.INSTAGRAM_USERNAME} 仍在直播中`);
        } else {
            console.log(`⚫ @${CONFIG.INSTAGRAM_USERNAME} 目前沒有直播`);
        }

    } catch (error) {
        console.error('監控過程中發生錯誤:', error);
    }
}

// Discord客戶端事件
client.once('ready', () => {
    console.log(`✅ Discord Bot已準備就緒: ${client.user.tag}`);
    console.log(`📺 開始監控 @${CONFIG.INSTAGRAM_USERNAME} 的直播狀態`);
    
    // 載入上次狀態
    lastStatus = loadStatus();
    console.log('上次狀態:', lastStatus);
    
    // 開始定期檢查
    setInterval(monitorInstagramLive, CONFIG.CHECK_INTERVAL);
    
    // 立即執行一次檢查
    monitorInstagramLive();
});

client.on('error', error => {
    console.error('Discord客戶端錯誤:', error);
});

// 處理程式終止
process.on('SIGINT', () => {
    console.log('\n正在關閉機器人...');
    saveStatus(lastStatus);
    client.destroy();
    process.exit(0);
});

// 啟動Bot
if (!CONFIG.DISCORD_TOKEN || !CONFIG.CHANNEL_ID || !CONFIG.INSTAGRAM_USERNAME) {
    console.error('❌ 缺少必要的環境變數:');
    console.error('- DISCORD_TOKEN: Discord Bot Token');
    console.error('- CHANNEL_ID: Discord頻道ID'); 
    console.error('- INSTAGRAM_USERNAME: 要監控的Instagram用戶名');
    process.exit(1);
}

client.login(CONFIG.DISCORD_TOKEN);