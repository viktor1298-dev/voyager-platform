import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 1920, height: 1080 } });

test('QA R4', async ({ page }) => {
  await page.goto('http://voyager-platform.voyagerlabs.co/login');
  await page.locator('#email').fill('admin@voyager.local');
  await page.locator('#password').fill('admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
  await page.screenshot({ path: '/tmp/qa4-dashboard.png', fullPage: true });
  
  await page.goto('/clusters');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: '/tmp/qa4-clusters.png', fullPage: true });
  
  await page.locator('tbody tr').first().click();
  await expect(page).toHaveURL(/\/clusters\/.+/);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/tmp/qa4-detail.png', fullPage: true });
  
  await page.goto('/clusters');
  await page.getByRole('button', { name: /add cluster/i }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/qa4-wizard.png', fullPage: true });
  
  await page.goto('/teams');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/qa4-teams.png', fullPage: true });
});
