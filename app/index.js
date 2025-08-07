require('dotenv').config();
const { chromium } = require('playwright');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');

// === CONFIG ===
const CONFIG = {
  IG_USERNAME: process.env.INSTAGRAM_USERNAME,
  IG_COOKIES: process.env.INSTAGRAM_COOKIES,
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CHANNEL_ID: process.env.CHANNEL_ID,
  CHECK_INTERVAL: 60 * 1000,
};

let lastStatus = { isLive: false };

function loadStatus() {
  try {
    return fs.existsSync('status.json') ?
      JSON.parse(fs.readFileSync('status.json', 'utf8')) : { isLive: false };
  } catch {
    return { isLive: false };
  }
}

function saveStatus(status) {
  fs.writeFileSync('status.json', JSON.stringify(status, null, 2));
}

function parseCookieString(cookieStr) {
  return cookieStr.split(';').map(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    return {
      name,
      value: rest.join('='),
      domain: '.instagram.com',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax'
    };
  });
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', () => {
  console.log(`✅ Bot Ready: ${client.user.tag}`);
  lastStatus = loadStatus();
  checkLoop();
  setInterval(checkLoop, CONFIG.CHECK_INTERVAL);
});

async function sendNotification() {
  const channel = client.channels.cache.get(CONFIG.CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("🔴 Instagram 正在直播")
    .setDescription(`@${CONFIG.IG_USERNAME} 正在直播中！`)
    .setURL(`https://www.instagram.com/${CONFIG.IG_USERNAME}/`)
    .setColor(0xE1306C)
    .setTimestamp();

  await channel.send({
    content: `@everyone IG 用戶 **${CONFIG.IG_USERNAME}** 正在直播中！`,
    embeds: [embed]
  });
}

async function checkLoop() {
  const browser = await chromium.launch({ headless: true });

  const cookies = parseCookieString(CONFIG.IG_COOKIES);
  const context = await browser.newContext({ storageState: { cookies } });
  const page = await context.newPage();

  try {
    await page.goto(`https://www.instagram.com/${CONFIG.IG_USERNAME}/`, { waitUntil: 'networkidle' });

    const isLive = await page.locator('span').filter({
      hasText: /^LIVE$/i
    }).count() > 0;

    if (isLive && !lastStatus.isLive) {
      console.log("🔴 偵測到正在直播");
      await sendNotification();
      lastStatus = { isLive: true };
      saveStatus(lastStatus);
    } else if (!isLive && lastStatus.isLive) {
      console.log("⚫ 直播結束");
      lastStatus = { isLive: false };
      saveStatus(lastStatus);
    } else {
      console.log(isLive ? "🔴 持續直播中" : "⚫ 尚未直播");
    }

  } catch (err) {
    console.error("❌ 錯誤:", err.message);
  } finally {
    await browser.close();
  }
}

client.login(CONFIG.DISCORD_TOKEN);
