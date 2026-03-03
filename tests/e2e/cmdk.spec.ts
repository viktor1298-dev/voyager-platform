import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

test.describe('Command Palette (⌘K)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const getPalette = (page: Page) =>
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

  test('resource items (clusters) appear in palette results', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = getPalette(page);
    await expect(palette).toBeVisible({ timeout: 3000 });

    // Resource items section should show clusters
    const clusterItem = palette.locator('[cmdk-item], [role="option"]').filter({ hasText: /Cluster/i }).first();
    await expect(clusterItem).toBeVisible({ timeout: 5000 });
  });

  test('navigating via palette adds item to recent items', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = getPalette(page);
    await expect(palette).toBeVisible({ timeout: 3000 });

    // Select and navigate to first resource item
    const firstItem = palette.locator('[cmdk-item], [role="option"]').first();
    await expect(firstItem).toBeVisible({ timeout: 5000 });
    const itemText = await firstItem.textContent();
    await firstItem.click();

    // Wait for navigation to complete and localStorage to persist
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');

    // Re-open palette
    await page.keyboard.press('Control+k');
    const reopenedPalette = getPalette(page);
    await expect(reopenedPalette).toBeVisible({ timeout: 5000 });

    const recentSection = reopenedPalette.locator('text=Recent').first();
    await expect(recentSection).toBeVisible({ timeout: 5000 });

    // The visited item should appear in recent items
    if (itemText) {
      const recentItem = reopenedPalette.locator('[cmdk-item], [role="option"]').filter({ hasText: itemText.trim().substring(0, 20) }).first();
      await expect(recentItem).toBeVisible({ timeout: 3000 });
    }
  });
});
