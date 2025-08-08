import { chromium } from 'playwright';
import fetch from 'node-fetch';
import { DEFAULT_LIVE_LOCATORS, loadExtraLocatorsFromEnv } from './selectors.js';
import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });

// ===== 設定 =====
const IG_USERS = (process.env.IG_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
if (IG_USERS.length === 0) {
  log.error('環境変数 IG_USERS が空です（カンマ区切り）'); process.exit(1);
}
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 60000);
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!DISCORD_WEBHOOK_URL) { log.error('DISCORD_WEBHOOK_URL が未設定'); process.exit(1); }

const HEADLESS = (process.env.HEADLESS || 'true').toLowerCase() !== 'false';
const VIEWPORT = { width: 1280, height: 800 };

const LIVE_LOCATORS = [...DEFAULT_LIVE_LOCATORS, ...loadExtraLocatorsFromEnv()];

// 認証: IG_STORAGE_STATE_B64 (storageState.json の Base64) または IG_COOKIES_JSON
const STORAGE_STATE_PATH = '/tmp/storageState.json';

async function writeStorageStateFromEnv() {
  if (process.env.IG_STORAGE_STATE_B64) {
    const fs = await import('fs/promises');
    const buf = Buffer.from(process.env.IG_STORAGE_STATE_B64, 'base64');
    await fs.writeFile(STORAGE_STATE_PATH, buf);
    return STORAGE_STATE_PATH;
  }
  if (process.env.IG_COOKIES_JSON) {
    const fs = await import('fs/promises');
    const cookies = JSON.parse(process.env.IG_COOKIES_JSON);
    await fs.writeFile(STORAGE_STATE_PATH, JSON.stringify({ cookies }));
    return STORAGE_STATE_PATH;
  }
  return null;
}

// Discord 通知
async function sendDiscord(content, embeds) {
  const body = { content, embeds };
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Discord webhook failed: ${res.status} ${t}`);
  }
}

// LIVE 検知: 複数ロケータいずれかにヒットしたら LIVE
async function detectLiveOnProfile(page, username) {
  const profileUrl = `https://www.instagram.com/${username}/`;
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 軽い人間っぽい操作（ヘルス&検知回避）
  await page.mouse.move(200 + Math.random() * 400, 200 + Math.random() * 200);
  await page.waitForTimeout(500 + Math.random() * 1000);
  await page.evaluate(() => window.scrollTo(0, Math.floor(Math.random() * 200)));

  for (const loc of LIVE_LOCATORS) {
    try {
      const el = page.locator(loc);
      if (await el.first().isVisible({ timeout: 500 })) {
        return { live: true, matched: loc, url: profileUrl };
      }
    } catch { /* ignore */ }
  }

  // フォールバック: URL 内 "live" のヒント（将来の UI 変更対策）
  const html = await page.content();
  if (/\"LIVE\"/i.test(html) || /\blive\b/i.test(html)) {
    return { live: true, matched: 'fallback:html-search', url: profileUrl };
  }

  return { live: false, matched: null, url: profileUrl };
}

// メインループ
export async function run() {
  const storagePath = await writeStorageStateFromEnv();
  if (!storagePath) {
    log.warn('認証情報がありません。公開プロフィールは読めますが、ログイン必須要素は取れない可能性があります。');
  }

  const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    storageState: storagePath || undefined,
    viewport: VIEWPORT,
    userAgent: process.env.USER_AGENT || undefined
  });
  const page = await context.newPage();

  const state = new Map(); // username -> { live: boolean, lastMatched: string }

  async function checkOnce() {
    for (const user of IG_USERS) {
      try {
        const { live, matched, url } = await detectLiveOnProfile(page, user);
        const prev = state.get(user)?.live ?? false;
        state.set(user, { live, lastMatched: matched });

        if (live && !prev) {
          // 通知（初回検知のみ）
          await sendDiscord(
            `📡 **${user}** が Instagram で **LIVE** を開始した可能性があります！\n${url}`,
            [{
              title: `${user} is LIVE`,
              description: `Detector matched: \`${matched}\``,
              url,
              timestamp: new Date().toISOString()
            }]
          );
          log.info({ user, matched }, 'LIVE detected & notified');
        } else {
          log.info({ user, live, matched }, 'checked');
        }
      } catch (e) {
        log.warn({ err: e.message, user }, 'check error');
      }
    }
  }

  // すぐ1回実行→以後 interval
  await checkOnce();
  setInterval(checkOnce, CHECK_INTERVAL_MS).unref();

  // ヘルスチェック向けに状態を返す関数（server.js から参照）
  return {
    getState: () =>
      Object.fromEntries([...state.entries()].map(([k, v]) => [k, v])),
    close: async () => { await context.close(); await browser.close(); }
  };
}
