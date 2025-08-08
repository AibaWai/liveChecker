import { Page } from '@playwright/test';

/**
 * 回傳 true 代表推定正在直播
 * 這些 selector 會變動，必要時請更新
 */
export async function isLive(page: Page): Promise<boolean> {
  // 策略 1：Profile 頁面上帶「Live」徽章（字樣/aria/role）
  const liveText = page.locator('text=/\\bLive\\b/i');
  if (await liveText.first().isVisible().catch(() => false)) return true;

  // 策略 2：Story/頭像帶「LIVE」標記（常見為圓圈 + LIVE）
  const candidateSelectors = [
    // 常見在頭像附近的 LIVE 字樣
    'span:has-text("LIVE")',
    'div:has-text("LIVE")', 
    // 某些變體：aria-label 或 title 帶 Live
    '[aria-label*="Live" i]',
    '[title*="Live" i]',
    // profile story 圈
    'canvas + span:has-text("LIVE")'
  ];
  for (const sel of candidateSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) return true;
  }

  // 策略 3：嘗試點擊「直播/故事」入口看是否跳到直播播放器（有限風險）
  const openers = page.locator('a:has-text("Live"), a:has-text("LIVE")');
  if (await openers.count() > 0) {
    // 不實際點擊，以免造成觀眾紀錄；若你想更保險，可取消註解：
    // await openers.first().click({ trial: true }).catch(()=>{});
  }

  return false;
}
