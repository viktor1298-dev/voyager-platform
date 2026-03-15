import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://voyager-platform.voyagerlabs.co';

test.describe('Dashboard UX contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
  });

  test('removes fabricated telemetry language from the dashboard shell', async ({ page }) => {
    await expect(page.getByText(/^Health trend$/i)).toHaveCount(0);
  });

  test('active environment filter state is reflected in URL and visible chip semantics', async ({ page }) => {
    await page.goto(`${BASE_URL}?environment=prod`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Env: prod')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/environment=prod/);

    const clearButton = page.getByRole('button', { name: /clear/i });
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    await expect(page.getByText('Env: prod')).toHaveCount(0);
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
