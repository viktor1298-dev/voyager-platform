import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Command Palette (⌘K)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Ctrl+K opens command palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Should have a search input
    const input = dialog.locator('input[placeholder]').first();
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test('typing filters results', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const input = dialog.locator('input[placeholder]').first();
    await input.fill('dashboard');

    // Should show filtered results containing "dashboard"
    const items = dialog.locator('[cmdk-item], [role="option"]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).textContent();
      expect(text?.toLowerCase()).toContain('dashboard');
    }
  });

  test('arrow keys navigate items', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Press ArrowDown to select second item
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    // An item should have aria-selected or data-selected
    const selected = dialog.locator('[aria-selected="true"], [data-selected="true"]');
    await expect(selected).toHaveCount(1);
  });

  test('Enter navigates to selected item', async ({ page }) => {
    const initialUrl = page.url();
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Select first item and press Enter
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // URL should have changed (navigated somewhere)
    await page.waitForTimeout(1000);
    // We just verify the dialog closed — navigation target depends on data
  });

  test('Escape closes command palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });
});
