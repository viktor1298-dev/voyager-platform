import { test, expect } from '@playwright/test';

const BASE = 'http://voyager-platform.voyagerlabs.co';
const EMAIL = 'admin@voyager.local';
const PASS = 'admin123';

test.use({ viewport: { width: 1920, height: 1080 } });

async function login(page) {
  await page.goto(BASE);
  await page.waitForTimeout(2000);
  // Check if we're on login page
  const url = page.url();
  console.log('Current URL after goto:', url);
  
  // Try to find email/password fields
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').first();
  const passInput = page.locator('input[type="password"], input[name="password"]').first();
  
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill(EMAIL);
    await passInput.fill(PASS);
    // Click submit
    await page.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Log")').first().click();
    await page.waitForTimeout(3000);
  }
  console.log('Post-login URL:', page.url());
}

test('1-Dashboard', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/dashboard');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/e2e/screenshots/dashboard.png' });
  // Check for clusters/metrics content
  const body = await page.textContent('body');
  console.log('Dashboard has content length:', body?.length);
  expect(body?.length).toBeGreaterThan(100);
});

test('2-Clusters', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/clusters');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/e2e/screenshots/clusters.png' });
  const body = await page.textContent('body');
  console.log('Clusters page content length:', body?.length);
  // Try clicking first cluster
  const clusterLink = page.locator('a[href*="cluster"], tr >> nth=1, [data-testid*="cluster"]').first();
  if (await clusterLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clusterLink.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/e2e/screenshots/cluster-detail.png' });
    console.log('Cluster detail URL:', page.url());
  }
});

test('3-Pods-Section', async ({ page }) => {
  await login(page);
  // Navigate to cluster detail with pods
  await page.goto(BASE + '/clusters');
  await page.waitForTimeout(2000);
  const clusterLink = page.locator('a[href*="cluster"], tr >> nth=1, [data-testid*="cluster"]').first();
  if (await clusterLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clusterLink.click();
    await page.waitForTimeout(2000);
  }
  // Look for pods section
  const podsSection = page.locator('text=Pods, [data-testid*="pod"], h2:has-text("Pod"), h3:has-text("Pod")').first();
  const hasPods = await podsSection.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Pods section visible:', hasPods);
  await page.screenshot({ path: 'tests/e2e/screenshots/pods-section.png' });
  
  // Check for pod attributes: name, namespace, status, age
  const body = await page.textContent('body') || '';
  const hasNamespace = body.toLowerCase().includes('namespace');
  const hasStatus = body.toLowerCase().includes('status') || body.toLowerCase().includes('running');
  console.log('Has namespace:', hasNamespace, 'Has status:', hasStatus);
});

test('4-Delete-Pod', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/clusters');
  await page.waitForTimeout(2000);
  const clusterLink = page.locator('a[href*="cluster"], tr >> nth=1, [data-testid*="cluster"]').first();
  if (await clusterLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clusterLink.click();
    await page.waitForTimeout(2000);
  }
  // Look for delete button
  const deleteBtn = page.locator('button:has-text("Delete"), button[aria-label*="delete"], [data-testid*="delete-pod"]').first();
  const hasDelete = await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Delete pod button visible:', hasDelete);
  await page.screenshot({ path: 'tests/e2e/screenshots/delete-pod.png' });
  
  if (hasDelete) {
    await deleteBtn.click();
    await page.waitForTimeout(1000);
    // Check for confirm dialog
    const confirmDialog = page.locator('[role="dialog"], .modal, [data-testid*="confirm"]').first();
    const hasConfirm = await confirmDialog.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Confirm dialog visible:', hasConfirm);
    await page.screenshot({ path: 'tests/e2e/screenshots/delete-confirm.png' });
    // Cancel
    const cancelBtn = page.locator('button:has-text("Cancel"), button:has-text("No")').first();
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    }
  }
});

test('5-Deployments', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/deployments');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/e2e/screenshots/deployments.png' });
  const body = await page.textContent('body');
  console.log('Deployments content length:', body?.length);
  // Look for Scale button
  const scaleBtn = page.locator('button:has-text("Scale"), [data-testid*="scale"]').first();
  const hasScale = await scaleBtn.isVisible({ timeout: 3000 }).catch(() => false);
  console.log('Scale button visible:', hasScale);
});

test('6-Navigation', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/dashboard');
  await page.waitForTimeout(2000);
  // Check sidebar
  const sidebar = page.locator('nav, [role="navigation"], aside').first();
  const hasSidebar = await sidebar.isVisible({ timeout: 3000 }).catch(() => false);
  console.log('Sidebar visible:', hasSidebar);
  
  // Navigate through pages
  for (const path of ['/clusters', '/deployments', '/alerts', '/settings']) {
    await page.goto(BASE + path);
    await page.waitForTimeout(1500);
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    console.log(`Page ${path} loaded, URL: ${page.url()}`);
  }
  await page.screenshot({ path: 'tests/e2e/screenshots/navigation.png' });
});

test('7-Alerts', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/alerts');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/e2e/screenshots/alerts.png' });
  const body = await page.textContent('body');
  console.log('Alerts content length:', body?.length);
});

test('8-Settings', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/settings');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/e2e/screenshots/settings.png' });
  const body = await page.textContent('body');
  console.log('Settings content length:', body?.length);
});
