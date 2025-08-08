import { BrowserContext, Cookie } from '@playwright/test';
import fs from 'fs';
import { logger } from './logger.js';

export async function loadCookiesFromEnvOrFile(): Promise<Cookie[]> {
  const env = process.env.COOKIES_JSON?.trim();
  if (env) {
    try {
      return JSON.parse(env);
    } catch {
      throw new Error('COOKIES_JSON 不是有效 JSON');
    }
  }
  const path = '/app/cookies.json';
  if (fs.existsSync(path)) {
    const raw = fs.readFileSync(path, 'utf-8');
    return JSON.parse(raw);
  }
  throw new Error('找不到 cookies（請設定 COOKIES_JSON 或掛載 /app/cookies.json）');
}

export async function applyCookies(context: BrowserContext, cookies: Cookie[]) {
  await context.addCookies(cookies);
}

export async function checkLoggedIn(pageUrl: string, context: BrowserContext) {
  // 粗略健康檢查：能開啟 IG 頁面且有 body 結構
  const page = await context.newPage();
  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const hasBody = await page.locator('body').count();
    return hasBody > 0;
  } finally {
    await page.close();
  }
}
