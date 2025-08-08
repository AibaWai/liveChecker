import { Page } from '@playwright/test';

/**
 * 回傳 true 代表推定正在直播。
 * DOM 容易改版，必要時請更新選擇器。
 */
export async function isLive(page: Page): Promise<boolean> {
  // 策略 1：頁面上直接有 Live 文案（英文）
  const liveText = page.locator('text=/\\bLive\\b/i');
  if (await liveText.first().isVisible().catch(() => false)) return true;

  // 策略 2：常見 LIVE 標籤/徽章（各種元素）
  const candidateSelectors = [
    'span:has-text("LIVE")',
    'div:has-text("LIVE")',
    '[aria-label*="Live" i]',
    '[title*="Live" i]',
    // 有些樣式會在頭像圓圈附近渲染 LIVE 字樣
    'canvas + span:has-text("LIVE")'
  ];

  for (const sel of candidateSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) return true;
  }

  // （保守起見不實際點擊任何 story/Live 入口）
  return false;
}
