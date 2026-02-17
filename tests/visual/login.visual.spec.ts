import { expect, test } from '@playwright/test';

test('login page', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('login.png');
});
