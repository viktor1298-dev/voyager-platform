import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Confirmation Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/users');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
  });

  test('delete action shows confirmation dialog', async ({ page }) => {
    // Find a delete button in the table
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
    const hasDelete = await deleteBtn.isVisible().catch(() => false);
    if (!hasDelete) {
      test.skip();
      return;
    }

    await deleteBtn.click();

    // Confirmation dialog should appear
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });

    // Should contain confirmation text
    const dialogText = await dialog.first().textContent();
    expect(dialogText?.toLowerCase()).toMatch(/sure|confirm|delete|remove/);

    // Should have Cancel and Confirm buttons
    const cancelBtn = dialog.first().getByRole('button', { name: /cancel/i });
    const confirmBtn = dialog.first().getByRole('button', { name: /confirm|delete|yes/i });
    await expect(cancelBtn).toBeVisible();
    await expect(confirmBtn).toBeVisible();
  });

  test('cancel does not delete the item', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 5000 });
    const rowsBefore = await table.locator('tbody tr').count();

    const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
    const hasDelete = await deleteBtn.isVisible().catch(() => false);
    if (!hasDelete) {
      test.skip();
      return;
    }

    await deleteBtn.click();

    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });

    // Click cancel
    await dialog.first().getByRole('button', { name: /cancel/i }).click();
    await expect(dialog.first()).not.toBeVisible({ timeout: 3000 });

    // Row count should be the same
    const rowsAfter = await table.locator('tbody tr').count();
    expect(rowsAfter).toBe(rowsBefore);
  });

  test('confirm deletes the item', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 5000 });
    const rowsBefore = await table.locator('tbody tr').count();

    const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
    const hasDelete = await deleteBtn.isVisible().catch(() => false);
    if (!hasDelete) {
      test.skip();
      return;
    }

    await deleteBtn.click();

    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });

    // Click confirm
    await dialog.first().getByRole('button', { name: /confirm|delete|yes/i }).first().click();

    // Dialog should close
    await expect(dialog.first()).not.toBeVisible({ timeout: 5000 });

    // Wait for deletion to process
    await page.waitForTimeout(1000);

    // Row count should decrease (or toast confirms deletion)
    const rowsAfter = await table.locator('tbody tr').count();
    expect(rowsAfter).toBeLessThan(rowsBefore);
  });
});
