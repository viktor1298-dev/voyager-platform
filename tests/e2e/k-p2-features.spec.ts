import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('K-P2 Features', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar navigation: main nav items exist', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    for (const label of ['Dashboard', 'Clusters', 'Alerts', 'Events', 'Logs', 'Settings']) {
      await expect(sidebar.getByRole('link', { name: new RegExp(`^${label}$`, 'i') })).toBeVisible();
    }
  });

  test('notification bell: click opens dropdown with alerts', async ({ page }) => {
    await page.goto('/');

    const bellButton = page.locator('button:has(svg.lucide-bell), button[aria-label*="otif" i], button:has([data-testid="bell"])').first();
    await expect(bellButton).toBeVisible({ timeout: 15_000 });

    await bellButton.click();

    const dropdown = page.locator('text=Notifications').first();
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
  });

  test.skip('pod detail sheet: click pod row opens sheet with info', 'Pods are nested under cluster detail and require seeded live data', async ({ page }) => {
    await page.goto('/pods');
    const podRow = page.locator('table tbody tr, [data-testid="pod-row"], [role="row"]').first();
    await expect(podRow).toBeVisible({ timeout: 15_000 });
    await podRow.click();
    const sheet = page.locator('[role="dialog"], [data-testid="pod-detail"], .sheet-content, [class*="Sheet"]');
    await expect(sheet.first()).toBeVisible({ timeout: 5_000 });
  });

  test('settings tabs: 7 tabs exist and can be switched', async ({ page }) => {
    await page.goto('/settings');

    const tabs = page.locator('[aria-label="Settings tabs"] a');
    await expect(tabs.first()).toBeVisible({ timeout: 15_000 });
    await expect(tabs).toHaveCount(7);

    for (let i = 0; i < 7; i++) {
      await tabs.nth(i).click();
      await expect(page.getByRole('navigation', { name: /settings tabs/i })).toBeVisible({ timeout: 10_000 });
    }
  });
});
