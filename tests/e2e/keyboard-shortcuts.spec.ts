import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('? opens keyboard shortcuts modal', async ({ page }) => {
    // Make sure no input is focused
    await page.locator('body').click();
    await page.keyboard.press('?');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Should list shortcuts
    const dialogText = await dialog.textContent();
    expect(dialogText?.toLowerCase()).toMatch(/shortcut|keyboard/);
  });

  test('shortcuts modal shows common shortcuts', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('?');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Should mention Ctrl+K or ⌘K
    const text = await dialog.textContent();
    expect(text).toMatch(/ctrl\+k|⌘k|command palette/i);
  });

  test('Escape closes shortcuts modal', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('?');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });
});
