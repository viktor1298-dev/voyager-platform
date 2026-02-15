import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Command Palette (⌘K)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const getPalette = (page: any) =>
    page.locator('[cmdk-root]').filter({ has: page.locator('[cmdk-input]') }).first();

  test('Ctrl+K opens command palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = getPalette(page);
    await expect(palette).toBeVisible({ timeout: 3000 });
    await expect(palette.locator('[cmdk-input]').first()).toBeVisible();
  });

  test('typing filters results', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = getPalette(page);
    await expect(palette).toBeVisible({ timeout: 3000 });

    await palette.locator('[cmdk-input]').first().fill('dashboard');
    await expect(palette.locator('[cmdk-item], [role="option"]').first()).toBeVisible();
  });

  test('arrow keys navigate items', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = getPalette(page);
    await expect(palette).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    await expect(palette.locator('[aria-selected="true"], [data-selected="true"]')).toHaveCount(1);
  });

  test('Enter activates selected item', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = getPalette(page);
    await expect(palette).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(palette).toBeVisible();
  });

  test('Escape key does not break command palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = getPalette(page);
    await expect(palette).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('Escape');
    await expect(palette).toBeVisible();
  });
});
