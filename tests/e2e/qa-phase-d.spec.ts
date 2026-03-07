import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1920, height: 1080 } });
test.setTimeout(120000);

test('Phase D QA - Desktop', async ({ page }) => {
  // Login
  await page.goto('http://voyager-platform.voyagerlabs.co/login');
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'admin@voyager.local');
  await page.fill('#password', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/', { timeout: 30000 });
  console.log('✅ Login successful');

  // === CLUSTERS LIST ===
  await page.goto('http://voyager-platform.voyagerlabs.co/clusters');
  // Wait for either table rows or empty state
  await page.waitForSelector('tbody tr, [data-testid="empty-state"], .loading-complete', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/qa-clusters-list.png' });
  console.log('📸 Clusters list screenshot taken');

  // Check TopBar cluster selector
  const clusterSelectorVisible = await page.locator('[data-testid*="cluster"]').isVisible().catch(() => false) ||
    await page.getByRole('combobox').isVisible().catch(() => false) ||
    await page.locator('text=Select Cluster').isVisible().catch(() => false);
  console.log('TopBar cluster selector visible:', clusterSelectorVisible);

  // === CLUSTER DETAIL ===
  const firstRow = page.locator('tbody tr').first();
  const firstRowVisible = await firstRow.isVisible().catch(() => false);
  console.log('First row visible:', firstRowVisible);
  
  if (firstRowVisible) {
    await firstRow.click();
    // Wait for loading spinner to disappear
    await page.waitForSelector('text=Loading cluster details...', { state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const url = page.url();
    console.log('Cluster detail URL:', url);
    await page.screenshot({ path: '/tmp/qa-cluster-detail.png' });
    
    // Check for tabs
    await page.screenshot({ path: '/tmp/qa-cluster-tabs.png' });
    
    const liveTabVisible = await page.getByRole('tab', { name: /live/i }).isVisible().catch(() => false);
    const storedTabVisible = await page.getByRole('tab', { name: /stored/i }).isVisible().catch(() => false);
    // Also check for alternate tab text
    const liveAltVisible = await page.getByText(/live data|live feed/i).isVisible().catch(() => false);
    const storedAltVisible = await page.getByText(/stored data|history/i).isVisible().catch(() => false);
    console.log('Live tab visible:', liveTabVisible || liveAltVisible, '| Stored tab visible:', storedTabVisible || storedAltVisible);
    
    // Check connectivity indicator
    const connectivityVisible = await page.getByText(/last connected|last seen/i).isVisible().catch(() => false) ||
      await page.getByText(/just now|\d+ (minute|hour|day|second)s? ago/i).first().isVisible().catch(() => false);
    console.log('Connectivity indicator visible:', connectivityVisible);
    await page.screenshot({ path: '/tmp/qa-connectivity.png' });
    
    // Health badge
    const healthBadgeVisible = await page.getByText(/healthy|warning|critical|unknown/i).first().isVisible().catch(() => false);
    console.log('Health badge visible:', healthBadgeVisible);
    await page.screenshot({ path: '/tmp/qa-health.png' });
  }

  // === WIZARD ===
  await page.goto('http://voyager-platform.voyagerlabs.co/clusters');
  await page.waitForTimeout(2000);
  
  const addClusterBtn = page.getByRole('button', { name: /add cluster/i });
  const addBtnVisible = await addClusterBtn.isVisible().catch(() => false);
  console.log('Add cluster button visible:', addBtnVisible);
  
  if (addBtnVisible) {
    await addClusterBtn.first().click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/qa-wizard-step1.png' });
    
    const awsVisible = await page.getByRole('radio', { name: /aws|eks/i }).isVisible().catch(() =>
      page.getByText(/aws|eks/i).first().isVisible().catch(() => false));
    const azureVisible = await page.getByRole('radio', { name: /azure|aks/i }).isVisible().catch(() =>
      page.getByText(/azure|aks/i).first().isVisible().catch(() => false));
    const gkeVisible = await page.getByRole('radio', { name: /gke|google/i }).isVisible().catch(() =>
      page.getByText(/gke|google/i).first().isVisible().catch(() => false));
    console.log('AWS:', awsVisible, '| Azure:', azureVisible, '| GKE:', gkeVisible);
    await page.screenshot({ path: '/tmp/qa-wizard-providers.png' });
    
    // Close wizard
    const closeBtn = page.getByRole('button', { name: /cancel|close|×/i });
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
  }

  // === NAVIGATION ===
  await page.goto('http://voyager-platform.voyagerlabs.co/');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/qa-dashboard.png' });
  console.log('📸 Dashboard screenshot');

  await page.goto('http://voyager-platform.voyagerlabs.co/settings/teams');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/qa-teams.png' });
  console.log('📸 Teams screenshot');
  
  console.log('✅ Phase D QA Complete');
});
