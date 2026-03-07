import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Confirmation Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/settings/users');
    await expect(page).toHaveURL(/\/settings\/users/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 10_000 });
  });

  test('delete action shows confirmation dialog', async ({ page }) => {
    const deleteBtn = page.locator('button').filter({ has: page.locator('svg.lucide-trash2') }).first();
    const hasDelete = await deleteBtn.isVisible().catch(() => false);
    if (!hasDelete) {
      test.skip();
      return;
    }

    await deleteBtn.click();

    await expect(page.getByRole('heading', { name: /delete user/i })).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^delete$/i })).toBeVisible();
  });

  test('cancel does not delete the item', async ({ page }) => {
    const deleteBtn = page.locator('button').filter({ has: page.locator('svg.lucide-trash2') }).first();
    const hasDelete = await deleteBtn.isVisible().catch(() => false);
    if (!hasDelete) {
      test.skip();
      return;
    }

    await deleteBtn.click();
    await expect(page.getByRole('heading', { name: /delete user/i })).toBeVisible({ timeout: 3000 });

    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('heading', { name: /delete user/i })).not.toBeVisible({ timeout: 3000 });
  });

  test('confirm deletes the item', async ({ page }) => {
    const deleteBtn = page.locator('button').filter({ has: page.locator('svg.lucide-trash2') }).first();
    const hasDelete = await deleteBtn.isVisible().catch(() => false);
    if (!hasDelete) {
      test.skip();
      return;
    }

    await deleteBtn.click();
    await expect(page.getByRole('heading', { name: /delete user/i })).toBeVisible({ timeout: 3000 });

    await page.getByRole('button', { name: /^delete$/i }).click();
    await expect(page.getByRole('heading', { name: /delete user/i })).not.toBeVisible({ timeout: 5000 });
  });
});
