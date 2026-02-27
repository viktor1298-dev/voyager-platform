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

test('cluster-detail-pods', async ({ page }) => {
  await login(page);
  // Go to clusters page
  await page.goto(BASE + '/clusters');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/e2e/screenshots/clusters-pre-click.png' });
  
  // Click on cluster name link
  const clusterLink = page.locator('a:has-text("test-cluster-minikube"), td:has-text("test-cluster-minikube")').first();
  const visible = await clusterLink.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Cluster link visible:', visible);
  
  if (visible) {
    await clusterLink.click();
    await page.waitForTimeout(3000);
    console.log('Cluster detail URL:', page.url());
    await page.screenshot({ path: 'tests/e2e/screenshots/cluster-detail-full.png' });
    
    // Scroll down to find pods
    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/e2e/screenshots/cluster-detail-scrolled.png' });
    
    // Check for Pods heading
    const podsHeading = page.locator('text=/Pods/i').first();
    const hasPods = await podsHeading.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('Pods heading visible:', hasPods);
    
    // Check for delete button (trash icon)
    const deleteBtn = page.locator('button[title*="Delete pod"], button:has-text("Delete")').first();
    const hasDelete = await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Delete button visible:', hasDelete);
    
    if (hasDelete) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'tests/e2e/screenshots/delete-dialog.png' });
      // Look for cancel or close
      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
    }
  } else {
    // Try direct URL
    await page.goto(BASE + '/clusters/test-cluster-minikube');
    await page.waitForTimeout(3000);
    console.log('Direct URL:', page.url());
    await page.screenshot({ path: 'tests/e2e/screenshots/cluster-detail-direct.png' });
  }
});

test('deployments-scale', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/deployments');
  await page.waitForTimeout(3000);
  const scaleBtn = page.locator('button:has-text("Scale"), text=Scale').first();
  const hasScale = await scaleBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Scale button visible:', hasScale);
  if (hasScale) {
    await scaleBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/e2e/screenshots/scale-dialog.png' });
    await page.keyboard.press('Escape');
  }
});
