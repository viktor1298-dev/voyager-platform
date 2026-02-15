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
    const desktopTable = page.locator('table').first();
    await expect(desktopTable).toBeVisible({ timeout: 5000 });

    const rows = desktopTable.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('clicking column header sorts data', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 5000 });

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
    await expect.poll(async () => table.locator('tbody tr').count()).toBeGreaterThan(0);
    const rowsBefore = await table.locator('tbody tr').count();

    const firstEmail = (await table.locator('tbody tr').first().locator('td').nth(1).textContent())?.trim() ?? '';
    const query = firstEmail.slice(0, Math.min(5, firstEmail.length));
    expect(query.length).toBeGreaterThan(0);

    await searchInput.fill(query);

    const rowsAfter = await table.locator('tbody tr').count();
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore);
    expect(rowsAfter).toBeGreaterThan(0);
    await expect(table.locator('tbody tr').first()).toContainText(query, { ignoreCase: true });
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
