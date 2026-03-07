import { test, expect } from '@playwright/test';
import { login } from './helpers';

const BASE_URL = process.env.BASE_URL ?? 'http://voyager-platform.voyagerlabs.co';

test.describe('K-P2 Features', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar navigation: collapsible groups exist and can be toggled', async ({ page }) => {
    await page.goto(BASE_URL);
    const sidebar = page.locator('nav, [data-testid="sidebar"], aside').first();
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // Find collapsible group triggers
    const groupTriggers = sidebar.locator('button:has(svg), [data-collapsible] > button, [role="button"]');
    const count = await groupTriggers.count();
    expect(count).toBeGreaterThan(0);

    // Toggle first group
    const firstTrigger = groupTriggers.first();
    await firstTrigger.click();
    // Allow DOM to settle
    await page.waitForTimeout(300);
    // Toggle back
    await firstTrigger.click();
  });

  test('notification bell: click opens dropdown with alerts', async ({ page }) => {
    await page.goto(BASE_URL);

    // Find bell button
    const bellButton = page.locator('button:has(svg.lucide-bell), button[aria-label*="otif" i], button:has([data-testid="bell"])').first();
    await expect(bellButton).toBeVisible({ timeout: 15_000 });

    await bellButton.click();

    // Notifications dropdown should appear
    const dropdown = page.locator('text=Notifications').first();
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
  });

  test.skip('pod detail sheet: click pod row opens sheet with info', async ({ page }) => {
    // Skipped: /pods route does not exist in the app — pods are nested under /clusters/[id].
    // This test requires a known cluster ID to navigate to the pods tab.
    await page.goto(`${BASE_URL}/pods`);

    // Wait for pod table to load
    const podRow = page.locator('table tbody tr, [data-testid="pod-row"], [role="row"]').first();
    await expect(podRow).toBeVisible({ timeout: 15_000 });

    await podRow.click();

    // Sheet / drawer should open with pod details
    const sheet = page.locator('[role="dialog"], [data-testid="pod-detail"], .sheet-content, [class*="Sheet"]');
    await expect(sheet.first()).toBeVisible({ timeout: 5_000 });
  });

  test('settings tabs: 7 tabs exist and can be switched', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    // Wait for settings page — new layout uses Link-based nav inside aria-label="Settings tabs"
    // Use only the aria-label selector to avoid matching the sidebar /settings link
    const tabs = page.locator('[aria-label="Settings tabs"] a');
    await expect(tabs.first()).toBeVisible({ timeout: 15_000 });

    // Verify 7 tabs (General, Users, Teams, Permissions, Webhooks, Feature Flags, Audit Log)
    await expect(tabs).toHaveCount(7);

    // Click each tab to verify navigation works
    for (let i = 0; i < 7; i++) {
      await tabs.nth(i).click();
      await page.waitForLoadState('domcontentloaded');
    }
  });
});
