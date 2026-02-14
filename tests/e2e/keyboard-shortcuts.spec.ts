import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const modalTitle = /keyboard shortcuts/i;

  test('? opens keyboard shortcuts modal', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('?');

    await expect(page.getByRole('heading', { name: modalTitle })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/open command palette/i)).toBeVisible();
  });

  test('shortcuts modal shows common shortcuts', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('?');

    await expect(page.getByRole('heading', { name: modalTitle })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/ctrl/i)).toBeVisible();
    await expect(page.getByText(/open command palette/i)).toBeVisible();
  });

  test('Escape closes shortcuts modal', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('?');

    await expect(page.getByRole('heading', { name: modalTitle })).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: modalTitle })).not.toBeVisible({ timeout: 3000 });
  });
});
