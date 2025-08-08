import { Page } from '@playwright/test';

export async function simulateUserActivity(page: Page) {
  // 隨機滾動與滑鼠移動（不保證萬無一失，只是降風險）
  const width = 1200 + Math.floor(Math.random() * 200);
  const height = 800 + Math.floor(Math.random() * 200);
  await page.setViewportSize({ width, height });

  for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
    await page.mouse.move(
      Math.random() * width,
      Math.random() * height,
      { steps: 10 + Math.floor(Math.random() * 10) }
    );
    await page.waitForTimeout(300 + Math.random() * 500);
    await page.mouse.wheel(0, 200 + Math.random() * 800);
    await page.waitForTimeout(500 + Math.random() * 1000);
  }
}
