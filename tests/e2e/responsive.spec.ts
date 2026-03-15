import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Responsive — Mobile Viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('should login and load dashboard on mobile', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 10_000 });
  });

  test('should not have horizontal overflow on mobile', async ({ page }) => {
    await login(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /dashboard/i }).or(page.locator('h1, h2').first())).toBeVisible({ timeout: 10_000 });

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test('should handle sidebar on mobile without switching users table to desktop layout', async ({ page }) => {
    await login(page);
    await page.goto('/settings/users');
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 15_000 });

    const sidebar = page.locator('[data-testid="sidebar"]');
    const menuButton = page.getByRole('button', { name: /open navigation menu|close navigation menu/i });
    const desktopTable = page.locator('table').first();

    await expect(menuButton).toBeVisible();
    await expect(desktopTable).toBeHidden();

    await menuButton.click();
    await expect(sidebar).toBeVisible({ timeout: 5_000 });
    await expect(desktopTable).toBeHidden();
  });

  test('mobile nav first tap should navigate immediately', async ({ page }) => {
    await login(page);
    await page.goto('/settings/users', { waitUntil: 'domcontentloaded' });

    const menuButton = page.getByRole('button', { name: /open navigation menu|close navigation menu/i });
    await expect(menuButton).toBeVisible({ timeout: 10_000 });
    await menuButton.click();

    const settingsLink = page.getByTestId('nav-item-settings');
    await expect(settingsLink).toBeVisible({ timeout: 5_000 });
    await settingsLink.click();

    await page.waitForURL(/\/settings/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /^settings$/i })).toBeVisible({ timeout: 10_000 });
  });

  test('mobile nav tap lands on target route without login returnUrl drift', async ({ page }) => {
    await login(page);
    await page.goto('/clusters', { waitUntil: 'domcontentloaded' });

    const menuButton = page.getByRole('button', { name: /open navigation menu|close navigation menu/i });
    await expect(menuButton).toBeVisible({ timeout: 10_000 });
    await menuButton.click();

    const eventsLink = page.getByRole('link', { name: /^events$/i });
    await expect(eventsLink).toBeVisible({ timeout: 5_000 });
    await eventsLink.click();

    await page.waitForURL(/\/events/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/login\?/);
    await expect(page).not.toHaveURL(/returnUrl=/);
  });

  test('should render BYOK actions as full-width touch targets on mobile', async ({ page }) => {
    await login(page);
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });

    const actions = page.getByTestId('byok-actions');
    const saveBtn = page.getByTestId('byok-save');
    const testBtn = page.getByTestId('byok-test');

    await expect(actions).toBeVisible({ timeout: 15_000 });
    await expect(saveBtn).toBeVisible();
    await expect(testBtn).toBeVisible();

    const saveBox = await saveBtn.boundingBox();
    const testBox = await testBtn.boundingBox();

    expect(saveBox).not.toBeNull();
    expect(testBox).not.toBeNull();

    expect(Math.round(saveBox!.height)).toBeGreaterThanOrEqual(44);
    expect(Math.round(testBox!.height)).toBeGreaterThanOrEqual(44);
    expect(Math.abs(saveBox!.x - testBox!.x)).toBeLessThanOrEqual(2);
  });
});

test.describe('Responsive — Desktop Viewport', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('should keep desktop shell on /settings/users (no hamburger, desktop table visible)', async ({ page }) => {
    await login(page);
    await page.goto('/settings/users');

    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /open navigation menu|close navigation menu/i })).toBeHidden();

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();

    const usersTable = page.locator('table').first();
    await expect(usersTable).toBeVisible();
  });
});
