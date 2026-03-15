import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('BUG-192-001: Dashboard nav from /anomalies does not freeze', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Visiting /anomalies then clicking Dashboard sidebar link navigates to /', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto('/anomalies');
    await page.waitForURL(/\/alerts/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /alert rules/i })).toBeVisible({ timeout: 15_000 });

    const dashboardLink = page.getByTestId('nav-item-dashboard').or(page.getByRole('link', { name: /^dashboard$/i })).first();
    await expect(dashboardLink).toBeVisible({ timeout: 5_000 });
    await dashboardLink.click();

    await page.waitForFunction(
      () => window.location.pathname === '/' || window.location.pathname.includes('dashboard'),
      { timeout: 5000 }
    );

    const urlPath = new URL(page.url()).pathname;
    expect(urlPath).toBe('/');

    const dashboardContent = page.getByRole('heading', { name: /dashboard/i }).or(page.locator('[data-testid="dashboard"], h1, h2').first());
    await expect(dashboardContent).toBeVisible({ timeout: 5000 });

    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('BYOK') &&
      !e.includes('tRPC') &&
      !e.includes('trpc') &&
      !e.includes('fetch') &&
      !e.includes('AbortError') &&
      !e.includes('404')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('Multiple nav cycles between /anomalies and / do not freeze', async ({ page }) => {
    for (let cycle = 1; cycle <= 3; cycle++) {
      await page.goto('/anomalies');
      await page.waitForURL(/\/alerts/, { timeout: 15_000 });

      const dashboardLink = page.getByTestId('nav-item-dashboard').or(page.getByRole('link', { name: /^dashboard$/i })).first();
      await expect(dashboardLink).toBeVisible({ timeout: 5_000 });
      await dashboardLink.click();

      await page.waitForFunction(
        () => window.location.pathname === '/',
        { timeout: 5000 }
      );

      const urlPath = new URL(page.url()).pathname;
      expect(urlPath).toBe('/');
    }
  });
});
