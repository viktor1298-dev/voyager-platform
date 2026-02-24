import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 1920, height: 1080 } });

test('Phase D QA R3', async ({ page }) => {
  // Login
  await page.goto('http://voyager-platform.voyagerlabs.co/login');
  await page.locator('#email').fill('admin@voyager.local');
  await page.locator('#password').fill('admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
  await page.screenshot({ path: '/tmp/qa3-01-dashboard.png', fullPage: true });
  
  // Clusters list
  await page.goto('/clusters');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: '/tmp/qa3-02-clusters.png', fullPage: true });
  
  // Cluster detail — should show stored data, no error
  await page.locator('tbody tr').first().click();
  await expect(page).toHaveURL(/\/clusters\/.+/);
  await page.waitForTimeout(5000); // wait for live query to fail + fallback
  await page.screenshot({ path: '/tmp/qa3-03-detail.png', fullPage: true });
  
  // AddClusterWizard — check providers
  await page.goto('/clusters');
  await page.getByRole('button', { name: /add cluster/i }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/qa3-04-wizard.png', fullPage: true });
  
  // Teams page
  await page.goto('/teams');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/qa3-05-teams.png', fullPage: true });
});
