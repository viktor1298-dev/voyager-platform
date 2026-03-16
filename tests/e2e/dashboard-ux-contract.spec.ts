import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Dashboard UX contract', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
  });

  test('removes fabricated telemetry language from the dashboard shell', async ({ page }) => {
    await expect(page.getByText(/^Health trend$/i)).toHaveCount(0);
  });

  test('active environment filter state is reflected in URL and visible button semantics', async ({ page }) => {
    await page.goto('/?environment=prod', { waitUntil: 'domcontentloaded' });
    // The dashboard renders environment filter as buttons (prod, staging, dev, all)
    // The active filter button gets the accent/active style
    const prodButton = page.getByRole('button', { name: /prod/i }).first();
    await expect(prodButton).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/environment=prod/);

    // Click "all" to clear the filter
    const allButton = page.getByRole('button', { name: /^all/i }).first();
    await expect(allButton).toBeVisible({ timeout: 15_000 });
    await allButton.click();

    await expect(page).not.toHaveURL(/environment=prod/);
  });

  test('preserves dashboard customize flow test ids', async ({ page }) => {
    const widgetModeBtn = page.locator('[data-testid="toggle-widget-mode-btn"]');
    await expect(widgetModeBtn).toBeVisible();
    await widgetModeBtn.click();

    const customizeBtn = page.locator('[data-testid="customize-dashboard-btn"]');
    await expect(customizeBtn).toBeVisible();
    await customizeBtn.click();

    await expect(page.locator('[data-testid="dashboard-edit-bar"]')).toBeVisible();
  });
});
