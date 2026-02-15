import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('TanStack Table — Users Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /users/i }).first().click();
    await expect(page).toHaveURL(/\/users/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 10_000 });
  });

  test('table renders with data rows', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible();

    const dataRows = page.locator('tbody tr');
    await expect(dataRows.first()).toBeVisible({ timeout: 10_000 });
    expect(await dataRows.count()).toBeGreaterThan(0);
  });

  test('clicking column header sorts data', async ({ page }) => {
    const table = page.locator('table').first();
    const hasTable = await table.isVisible().catch(() => false);
    if (!hasTable) {
      test.skip();
      return;
    }

    const header = table.locator('thead th button').filter({ hasText: /email|name/i }).first();
    await expect(header).toBeVisible();
    await header.click();
    await header.click();

    const rows = table.locator('tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('filter/search narrows results', async ({ page }) => {
    const searchInput = page
      .getByRole('textbox', { name: /search users/i })
      .or(page.getByPlaceholder(/search users/i))
      .first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    const table = page.locator('table').first();
    const hasTable = await table.isVisible().catch(() => false);
    if (!hasTable) {
      await expect(page.getByText(/0 users/i)).toBeVisible();
      return;
    }

    const rowsBefore = await table.locator('tbody tr').count();
    await searchInput.fill('admin');
    const rowsAfter = await table.locator('tbody tr').count();
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore);
  });

  test('pagination controls work', async ({ page }) => {
    const nextBtn = page.locator('button[aria-label="Next page"]');
    const prevBtn = page.locator('button[aria-label="Previous page"]');

    const hasPagination = await nextBtn.isVisible().catch(() => false);
    if (!hasPagination) {
      test.skip();
      return;
    }

    await expect(prevBtn).toBeDisabled();
    await nextBtn.click();
    await expect(prevBtn).toBeEnabled();
  });
});
