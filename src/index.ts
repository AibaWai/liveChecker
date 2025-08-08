import 'dotenv/config';
import express, { Request, Response } from 'express';
import { chromium, Browser, BrowserContext } from '@playwright/test';
import { logger } from './logger.js';
import { sendDiscordMessage } from './discord.js';
import { loadCookiesFromEnvOrFile, applyCookies, checkLoggedIn } from './cookies.js';
import { simulateUserActivity } from './activity.js';
import { isLive } from './detectors.js';

const TARGET_USERNAME = process.env.TARGET_USERNAME!;
const INTERVAL = Number(process.env.POLL_INTERVAL_SECONDS || 60) * 1000;
const HEADLESS = (process.env.HEADLESS ?? 'true').toLowerCase() !== 'false';
const PORT = Number(process.env.PORT || 8080);

if (!TARGET_USERNAME) throw new Error('請設定 TARGET_USERNAME');

let browser: Browser;
let context: BrowserContext;

let lastCheckAt: string | null = null;
let lastStatus: 'LIVE' | 'OFFLINE' | 'UNKNOWN' = 'UNKNOWN';
let lastNotifiedLiveId: string | null = null; // 去重複通知

async function setup() {
  logger.info({ HEADLESS }, 'Launching browser...');
  browser = await chromium.launch({ headless: HEADLESS });
  context = await browser.newContext({
    userAgent: undefined,
    locale: 'en-US'
  });

  const cookies = await loadCookiesFromEnvOrFile();
  await applyCookies(context, cookies);

  // 健康檢查（能正常開頁即可）
  const ok = await checkLoggedIn(`https://www.instagram.com/${TARGET_USERNAME}/`, context);
  if (!ok) throw new Error('無法開啟 Instagram 或 cookies 失效');

  logger.info('Cookies applied & basic health check passed');
}

async function checkOnce() {
  const page = await context.newPage();
  try {
    await page.goto(`https://www.instagram.com/${TARGET_USERNAME}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });

    // 用戶活動模擬
    await simulateUserActivity(page);

    const live = await isLive(page);
    lastCheckAt = new Date().toISOString();
    const newStatus: 'LIVE' | 'OFFLINE' = live ? 'LIVE' : 'OFFLINE';

    // 嘗試推導本次直播的簡單 ID（時間 + 標題 hash-ish）
    let liveId: string | null = null;
    if (live) {
      const title = (await page.title().catch(() => '')) || '';
      liveId = `${TARGET_USERNAME}:${new Date().toISOString().slice(0, 16)}:${title.slice(0, 50)}`;
    }

    if (live && liveId !== lastNotifiedLiveId) {
      await sendDiscordMessage(
        `🔴 **${TARGET_USERNAME}** is LIVE on Instagram! https://www.instagram.com/${TARGET_USERNAME}/`
      );
      lastNotifiedLiveId = liveId;
    }

    lastStatus = newStatus;
    logger.info({ status: newStatus }, 'Check finished');
  } catch (e: any) {
    logger.error({ err: e?.message }, 'Check failed');
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  await setup();
  await checkOnce();
  setInterval(checkOnce, INTERVAL);

  // 健康檢查端點
  const app = express();
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      target: TARGET_USERNAME,
      lastCheckAt,
      lastStatus,
      lastNotifiedLiveId: !!lastNotifiedLiveId
    });
  });
  app.listen(PORT, () => logger.info(`Health server listening on :${PORT}`));
}

main().catch(async (e) => {
  logger.error(e);
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  process.exit(1);
});
