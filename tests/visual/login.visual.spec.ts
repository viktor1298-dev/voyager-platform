import { expect, test } from '@playwright/test';
import { stabilizeVisuals } from './stabilize';

test('login page', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');

  const mask = await stabilizeVisuals(page);
  await expect(page).toHaveScreenshot('login.png', { mask });
});
