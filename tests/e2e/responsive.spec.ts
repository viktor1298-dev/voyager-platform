import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Responsive — Mobile Viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('should login and load dashboard on mobile', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 10_000 });
  });

  test('should not have horizontal overflow on mobile', async ({ page }) => {
    await login(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 10_000 });

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test('should handle sidebar on mobile', async ({ page }) => {
    await login(page);
    await page.goto('/');

    // Sidebar should be hidden or collapsible on mobile
    const sidebar = page.locator('nav, aside, [data-testid="sidebar"]').first();
    const menuButton = page.getByRole('button', { name: /menu|hamburger/i })
      .or(page.locator('[data-testid="mobile-menu"]'));

    // Either sidebar is hidden, or there's a hamburger menu
    const sidebarHidden = !(await sidebar.isVisible().catch(() => false));
    const hasMenuButton = (await menuButton.count()) > 0;

    expect(sidebarHidden || hasMenuButton).toBe(true);

    // If hamburger exists, click it and verify sidebar appears
    if (hasMenuButton && (await menuButton.first().isVisible())) {
      await menuButton.first().click();
      await expect(sidebar).toBeVisible({ timeout: 5_000 });
    }
  });
});
