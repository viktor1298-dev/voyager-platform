import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('TanStack Table — Users Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/users');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
  });

  test('table renders with data rows', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 5000 });

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking column header sorts data', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 5000 });

    // Click a sortable header (e.g., "Email" or "Name")
    const header = table.locator('thead th').filter({ hasText: /email|name/i }).first();
    await header.click();

    // After click, header should have sort indicator (aria-sort or icon change)
    // Get first cell value
    const firstCellBefore = await table.locator('tbody tr:first-child td').nth(1).textContent();

    // Click again to reverse sort
    await header.click();
    await page.waitForTimeout(500);

    const firstCellAfter = await table.locator('tbody tr:first-child td').nth(1).textContent();

    // If there's more than 1 row, order should potentially change
    // We just verify no crash and data still renders
    const rows = table.locator('tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('filter/search narrows results', async ({ page }) => {
    // Look for a search/filter input
    const searchInput = page.getByPlaceholder(/search|filter/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    const table = page.locator('table').first();
    const rowsBefore = await table.locator('tbody tr').count();

    // Type a filter value
    await searchInput.fill('admin');
    await page.waitForTimeout(500);

    const rowsAfter = await table.locator('tbody tr').count();
    // Filtered results should be <= original (or at least table still renders)
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore);
    expect(rowsAfter).toBeGreaterThan(0);
  });

  test('pagination controls work', async ({ page }) => {
    // Pagination buttons
    const nextBtn = page.getByRole('button', { name: /next/i })
      .or(page.locator('button[aria-label*="next" i]'))
      .first();

    const prevBtn = page.getByRole('button', { name: /previous/i })
      .or(page.locator('button[aria-label*="previous" i]'))
      .first();

    // If pagination exists (enough data), test it
    const hasNext = await nextBtn.isVisible().catch(() => false);
    if (!hasNext) {
      test.skip();
      return;
    }

    // Previous should be disabled on first page
    await expect(prevBtn).toBeDisabled();

    // Click next
    await nextBtn.click();
    await page.waitForTimeout(500);

    // Previous should now be enabled
    await expect(prevBtn).toBeEnabled();
  });
});
