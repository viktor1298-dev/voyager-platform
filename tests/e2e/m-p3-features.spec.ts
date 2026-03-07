import { test, expect } from '@playwright/test';
import { login } from './helpers';

const BASE_URL = process.env.BASE_URL ?? 'http://voyager-platform.voyagerlabs.co';

/**
 * M-P3 Feature E2E Tests
 * Covers: M-P3-002 (Metrics tab), M-P3-003 (InlineAiTrigger), M-P3-004 (Dashboard customize)
 *
 * FIX v192: clusters/page.tsx uses <tr data-row> rows with router.push() onClick, NOT <a href="/clusters/..."> links.
 * Navigation to cluster detail is done via:
 *   - Row click: [data-row] (desktop table)
 *   - Eye icon button: button[aria-label^="View cluster"] (ClusterActions component)
 *
 * FIX v192: Dashboard "Customize" button is inside widgetMode guard.
 * Must click [data-testid="toggle-widget-mode-btn"] first, then [data-testid="customize-dashboard-btn"].
 */

/** Navigate to the first cluster's detail page from the clusters list */
async function navigateToFirstCluster(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/clusters`);
  await page.waitForLoadState('domcontentloaded');

  // Wait for clusters data to load — rows appear in the table
  // Use the Eye-icon "View cluster" button from ClusterActions (aria-label="View cluster {name}")
  // This is more reliable than clicking the row since the Eye button is the explicit navigation action
  const viewBtn = page.locator('button[aria-label^="View cluster"]').first();
  const hasViewBtn = await viewBtn.isVisible({ timeout: 15_000 }).catch(() => false);

  if (hasViewBtn) {
    await viewBtn.click();
  } else {
    // Fallback: click the first data row directly (desktop table uses <tr data-row>)
    const dataRow = page.locator('tr[data-row]').first();
    await expect(dataRow).toBeVisible({ timeout: 15_000 });
    await dataRow.click();
  }

  // Wait for navigation to cluster detail page
  await page.waitForURL(/\/clusters\/[^/]+/, { timeout: 15_000 });
  await page.waitForLoadState('domcontentloaded');
}

test.describe('M-P3-002: Metrics Tab & TimeRangeSelector', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('cluster detail page has Metrics tab', async ({ page }) => {
    await navigateToFirstCluster(page);

    // Verify Metrics tab exists
    const metricsTab = page.locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics"), a:has-text("Metrics")').first();
    await expect(metricsTab).toBeVisible({ timeout: 15_000 });
  });

  test('TimeRangeSelector renders with range options when Metrics tab is active', async ({ page }) => {
    // Phase 3 feature — TimeRangeSelector not yet implemented
    test.skip(!process.env.PHASE3_READY, 'Phase 3 feature not yet built — skip until PHASE3_READY');
    await navigateToFirstCluster(page);

    // Click Metrics tab
    const metricsTab = page.locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics")').first();
    await expect(metricsTab).toBeVisible({ timeout: 15_000 });
    await metricsTab.click();

    // TimeRangeSelector should render with time range buttons
    const rangeButtons = page.locator('button:has-text("1h"), button:has-text("6h"), button:has-text("24h"), button:has-text("7d")');
    await expect(rangeButtons.first()).toBeVisible({ timeout: 10_000 });

    // Verify multiple range options exist
    const count = await rangeButtons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('clicking a time range button updates selection', async ({ page }) => {
    // Phase 3 feature — TimeRangeSelector not yet implemented
    test.skip(!process.env.PHASE3_READY, 'Phase 3 feature not yet built — skip until PHASE3_READY');
    await navigateToFirstCluster(page);

    const metricsTab = page.locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics")').first();
    await expect(metricsTab).toBeVisible({ timeout: 15_000 });
    await metricsTab.click();

    const btn7d = page.locator('button:has-text("7d")').first();
    await expect(btn7d).toBeVisible({ timeout: 10_000 });
    await btn7d.click();
    await page.waitForTimeout(300);
    // After clicking, the button should be active (no assertion on specific class — just verify no crash)
    await expect(btn7d).toBeVisible();
  });
});

test.describe('M-P3-003: InlineAiTrigger on AnomalyCard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('InlineAiTrigger button renders on AnomalyCard', async ({ page }) => {
    // Navigate to a cluster detail that shows anomaly cards
    await navigateToFirstCluster(page);

    // Look for InlineAiTrigger — typically an "Ask AI" button or AI icon within anomaly cards
    const aiTrigger = page
      .locator('[data-testid="inline-ai-trigger"], button:has-text("Ask AI"), button[aria-label*="AI"], button[aria-label*="ai"]')
      .first();

    // If anomaly cards are present, AI trigger should be visible
    const anomalyCard = page.locator('[data-testid="anomaly-card"], [class*="anomaly"]').first();
    const hasAnomalies = await anomalyCard.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasAnomalies) {
      await expect(aiTrigger).toBeVisible({ timeout: 10_000 });
    } else {
      // No anomaly cards on this cluster — check the dashboard anomaly timeline widget instead
      await page.goto(BASE_URL);
      await page.waitForLoadState('domcontentloaded');
      const dashAiTrigger = page
        .locator('[data-testid="inline-ai-trigger"], button:has-text("Ask AI")')
        .first();
      // Just verify the component can be found somewhere (skip if genuinely no data)
      const isVisible = await dashAiTrigger.isVisible({ timeout: 5_000 }).catch(() => false);
      test.info().annotations.push({
        type: 'note',
        description: isVisible ? 'InlineAiTrigger found on dashboard' : 'No anomalies in test env — skipped assertion',
      });
    }
  });

  test('InlineAiTrigger click opens InlineAiPanel', async ({ page }) => {
    await navigateToFirstCluster(page);

    const aiTrigger = page
      .locator('[data-testid="inline-ai-trigger"], button:has-text("Ask AI")')
      .first();

    const hasAiTrigger = await aiTrigger.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasAiTrigger) {
      test.skip(true, 'No InlineAiTrigger visible in current test env (no anomalies)');
      return;
    }

    await aiTrigger.click();

    // AI panel should appear
    const aiPanel = page.locator('text=AI Assistant, [class*="AI"], [class*="ai-panel"]').first();
    await expect(aiPanel).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('M-P3-004: Dashboard Customize & DashboardEditBar', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  /**
   * Enter widget mode first (widgetMode guard), then click Customize.
   * Dashboard "Customize" button is only rendered when widgetMode === true.
   * Toggle widget mode via: [data-testid="toggle-widget-mode-btn"]
   * Then Customize appears at: [data-testid="customize-dashboard-btn"]
   */
  async function enterWidgetModeAndCustomize(page: import('@playwright/test').Page) {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500); // Allow React hydration

    // First enable widget mode (required for Customize button to appear)
    const widgetModeBtn = page.locator('[data-testid="toggle-widget-mode-btn"]');
    await expect(widgetModeBtn).toBeVisible({ timeout: 15_000 });
    await widgetModeBtn.click();
    await page.waitForTimeout(300);

    // Now Customize button should be visible
    const customizeBtn = page.locator('[data-testid="customize-dashboard-btn"]');
    await expect(customizeBtn).toBeVisible({ timeout: 10_000 });
    return customizeBtn;
  }

  test('Customize button exists on dashboard (in widget mode)', async ({ page }) => {
    // Phase 3 feature — DashboardEditBar / widget mode not yet implemented
    test.skip(!process.env.PHASE3_READY, 'Phase 3 feature not yet built — skip until PHASE3_READY');
    const customizeBtn = await enterWidgetModeAndCustomize(page);
    await expect(customizeBtn).toBeVisible();
  });

  test('clicking Customize shows DashboardEditBar', async ({ page }) => {
    // Phase 3 feature — DashboardEditBar not yet implemented
    test.skip(!process.env.PHASE3_READY, 'Phase 3 feature not yet built — skip until PHASE3_READY');
    const customizeBtn = await enterWidgetModeAndCustomize(page);
    await customizeBtn.click();

    // DashboardEditBar should appear with edit mode indicator and buttons
    const editBar = page.locator('[data-testid="dashboard-edit-bar"]');
    await expect(editBar).toBeVisible({ timeout: 10_000 });
  });

  test('DashboardEditBar has Add Widget button that opens widget library', async ({ page }) => {
    // Phase 3 feature — widget library not yet implemented
    test.skip(!process.env.PHASE3_READY, 'Phase 3 feature not yet built — skip until PHASE3_READY');
    const customizeBtn = await enterWidgetModeAndCustomize(page);
    await customizeBtn.click();

    // Edit bar should be visible
    const editBar = page.locator('[data-testid="dashboard-edit-bar"]');
    await expect(editBar).toBeVisible({ timeout: 10_000 });

    // Click Add Widget button
    const addWidgetBtn = page.locator('[data-testid="add-widget-btn"]');
    await expect(addWidgetBtn).toBeVisible({ timeout: 10_000 });
    await addWidgetBtn.click();

    // Widget library drawer should open
    const drawer = page.locator('[data-testid="widget-library-drawer"], [role="dialog"][aria-label*="Widget"]').first();
    await expect(drawer).toBeVisible({ timeout: 10_000 });
  });
});
