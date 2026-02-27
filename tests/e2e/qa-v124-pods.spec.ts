import { test, expect } from '@playwright/test';

const BASE = 'http://voyager-platform.voyagerlabs.co';

test.use({ viewport: { width: 1920, height: 1080 } });

async function login(page) {
  await page.goto(BASE);
  await page.waitForTimeout(2000);
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').first();
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill('admin@voyager.local');
    await page.locator('input[type="password"]').first().fill('admin123');
    await page.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Log")').first().click();
    await page.waitForTimeout(3000);
  }
}

test('cluster-detail-via-row-click', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/clusters');
  await page.waitForTimeout(3000);
  
  // Click the table row containing cluster name
  const row = page.locator('tr:has-text("test-cluster-minikube")').first();
  const visible = await row.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Row visible:', visible);
  
  if (visible) {
    await row.click();
    await page.waitForTimeout(4000);
    console.log('After row click URL:', page.url());
    await page.screenshot({ path: 'tests/e2e/screenshots/cluster-detail-v2.png' });
    
    // Scroll down for pods
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/e2e/screenshots/cluster-detail-pods-v2.png' });
    
    // Check body text
    const body = await page.textContent('body') || '';
    console.log('Has Pods text:', body.includes('Pods'));
    console.log('Has namespace:', body.toLowerCase().includes('namespace'));
    console.log('Has Running:', body.includes('Running'));
    console.log('Has Delete:', body.includes('Delete') || body.includes('delete'));
    
    // Check for trash/delete icon buttons
    const trashBtns = await page.locator('button[title*="Delete pod"]').count();
    console.log('Delete pod buttons count:', trashBtns);
    
    if (trashBtns > 0) {
      await page.locator('button[title*="Delete pod"]').first().click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'tests/e2e/screenshots/delete-pod-dialog.png' });
      await page.keyboard.press('Escape');
    }
  }
  
  // Also try direct URL
  await page.goto(BASE + '/clusters/test-cluster-minikube');
  await page.waitForTimeout(4000);
  console.log('Direct URL result:', page.url());
  await page.screenshot({ path: 'tests/e2e/screenshots/cluster-detail-direct-v2.png' });
  
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/e2e/screenshots/cluster-detail-direct-scrolled.png' });
});

test('deployments-scale-icon', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/deployments');
  await page.waitForTimeout(3000);
  
  // From screenshot, Scale appears as icon button with text "Scale"
  const scaleBtns = await page.locator('text=Scale').count();
  console.log('Scale text count:', scaleBtns);
  
  // Try clicking the first Scale
  if (scaleBtns > 0) {
    await page.locator('text=Scale').first().click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/e2e/screenshots/scale-dialog-v2.png' });
  }
});
