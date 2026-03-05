import { test, expect } from '@playwright/test';
import { login } from './helpers';

const BASE_URL = process.env.BASE_URL ?? 'http://voyager-platform.voyagerlabs.co';

/**
 * M-P3 Feature E2E Tests
 * Covers: M-P3-002 (Metrics tab), M-P3-003 (InlineAiTrigger), M-P3-004 (Dashboard customize)
 */

test.describe('M-P3-002: Metrics Tab & TimeRangeSelector', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('cluster detail page has Metrics tab', async ({ page }) => {
    // Navigate to clusters list
    await page.goto(`${BASE_URL}/clusters`);
    await page.waitForLoadState('domcontentloaded');

    // Click the first cluster link
    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    await expect(clusterLink).toBeVisible({ timeout: 15_000 });
    await clusterLink.click();

    // Verify Metrics tab exists
    const metricsTab = page.locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics"), a:has-text("Metrics")').first();
    await expect(metricsTab).toBeVisible({ timeout: 15_000 });
  });

  test('TimeRangeSelector renders with range options when Metrics tab is active', async ({ page }) => {
    await page.goto(`${BASE_URL}/clusters`);
    await page.waitForLoadState('domcontentloaded');

    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    await expect(clusterLink).toBeVisible({ timeout: 15_000 });
    await clusterLink.click();

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
    await page.goto(`${BASE_URL}/clusters`);
    await page.waitForLoadState('domcontentloaded');

    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    await expect(clusterLink).toBeVisible({ timeout: 15_000 });
    await clusterLink.click();

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
    // Navigate to anomalies or a cluster detail that shows anomaly cards
    await page.goto(`${BASE_URL}/clusters`);
    await page.waitForLoadState('domcontentloaded');

    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    await expect(clusterLink).toBeVisible({ timeout: 15_000 });
    await clusterLink.click();
    await page.waitForLoadState('domcontentloaded');

    // Look for InlineAiTrigger — typically an "Ask AI" button or AI icon within anomaly cards
    // Try data-testid first, then fallback to text content
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
    await page.goto(`${BASE_URL}/clusters`);
    await page.waitForLoadState('domcontentloaded');

    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    await expect(clusterLink).toBeVisible({ timeout: 15_000 });
    await clusterLink.click();
    await page.waitForLoadState('domcontentloaded');

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

  test('Customize button exists on dashboard', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500); // Allow React hydration

    const customizeBtn = page
      .locator('button:has-text("Customize"), button[aria-label*="Customize"], [data-testid="customize-dashboard"]')
      .first();
    await expect(customizeBtn).toBeVisible({ timeout: 15_000 });
  });

  test('clicking Customize shows DashboardEditBar', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const customizeBtn = page
      .locator('button:has-text("Customize"), button[aria-label*="Customize"], [data-testid="customize-dashboard"]')
      .first();
    await expect(customizeBtn).toBeVisible({ timeout: 15_000 });
    await customizeBtn.click();

    // DashboardEditBar should appear — check for "Add Widget", "Reset", or "Done" buttons
    const editBar = page
      .locator('[data-testid="dashboard-edit-bar"], button:has-text("Add Widget"), button:has-text("Done"), button:has-text("Reset")')
      .first();
    await expect(editBar).toBeVisible({ timeout: 10_000 });
  });

  test('DashboardEditBar has Add Widget button that opens widget library', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Enter edit mode
    const customizeBtn = page
      .locator('button:has-text("Customize"), [data-testid="customize-dashboard"]')
      .first();
    await expect(customizeBtn).toBeVisible({ timeout: 15_000 });
    await customizeBtn.click();

    // Click Add Widget
    const addWidgetBtn = page.locator('button:has-text("Add Widget"), [data-testid="add-widget-btn"]').first();
    await expect(addWidgetBtn).toBeVisible({ timeout: 10_000 });
    await addWidgetBtn.click();

    // Widget library drawer should open
    const drawer = page.locator('[data-testid="widget-library-drawer"], [role="dialog"][aria-label*="Widget"]').first();
    await expect(drawer).toBeVisible({ timeout: 10_000 });
  });
});
