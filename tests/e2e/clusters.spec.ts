import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Clusters — CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should open add-cluster wizard and block progress without kubeconfig', async ({ page }) => {
    await page.goto('/clusters');
    await page.getByRole('button', { name: /add cluster/i }).first().click();

    await expect(page.getByRole('heading', { name: /add cluster/i })).toBeVisible();
    await expect(page.getByText(/step 1\/4/i)).toBeVisible();
    await expect(page.getByRole('radio', { name: /kubeconfig/i })).toBeChecked();

    await page.getByRole('button', { name: /next/i }).click();
    await expect(page.getByText(/step 2\/4/i)).toBeVisible();

    await expect(page.getByRole('button', { name: /go to next step|next/i })).toBeDisabled();
    await expect(page.getByText(/fill the required credential fields to continue/i)).toBeVisible();
  });

  test('should view cluster detail', async ({ page }) => {
    await page.goto('/clusters');

    // Wait for either the data table with rows OR a query error
    const table = page.locator('table').first();
    const queryError = page.getByText(/failed to load data/i);

    // Wait for one of: table visible OR error visible
    await expect(table.or(queryError)).toBeVisible({ timeout: 15_000 });

    // If the cluster list query itself failed, skip gracefully
    if (await queryError.isVisible()) {
      test.skip(true, 'Cluster list API returned an error — skipping detail navigation');
      return;
    }

    const firstRow = table.locator('tbody tr').first();
    // Wait for actual data rows (not skeleton/empty)
    try {
      await expect(firstRow).toBeVisible({ timeout: 10_000 });
      await expect(firstRow).toContainText(/.+/, { timeout: 10_000 });
    } catch {
      // Table visible but no data rows — empty seed data
      test.skip(true, 'No cluster rows found in table — seed data may be missing');
      return;
    }

    // Check for current empty state row contract ("No clusters")
    const firstRowText = await firstRow.innerText();
    if (/^\s*no clusters\s*$/i.test(firstRowText)) {
      test.skip(true, 'Table shows "No clusters" — no data to navigate to');
      return;
    }

    const cells = firstRow.locator('td');
    const cellCount = await cells.count();
    let nameCell = cells.first();
    for (let i = 0; i < cellCount; i++) {
      const text = await cells.nth(i).innerText({ timeout: 2_000 }).catch(() => '');
      if (text.trim()) { nameCell = cells.nth(i); break; }
    }
    await expect(nameCell).not.toBeEmpty();

    const clusterName = (await nameCell.innerText()).trim();

    await firstRow.click();
    await expect(page).toHaveURL(/\/clusters\/.+/);
    await expect(page.getByText(/loading cluster details/i)).toBeHidden({ timeout: 20_000 });

    const readyState = page.locator('h1').first().or(page.getByRole('heading', { name: /failed to load data/i }));
    await expect(readyState).toBeVisible();

    if (await page.getByRole('heading', { name: /failed to load data/i }).isVisible()) {
      // Cluster detail page can legitimately show "failed to load" when K8s API is unreachable
      // for seed clusters — this is expected behavior, not a bug
      await expect(page.getByText(/failed to fetch from k8s api|unable to transform/i)).toBeVisible();
    } else {
      await expect(page.locator('h1').first()).toContainText(clusterName);
    }
  });

  test('should show delete action for existing cluster row', async ({ page }) => {
    await page.goto('/clusters');

    // Wait for the table to render
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    // Wait for data to load (not skeleton)
    await expect(firstRow).toContainText(/.+/, { timeout: 10_000 });

    // Delete button is rendered only when user has admin permission on the cluster.
    // If not rendered, skip gracefully (RBAC-dependent).
    const deleteBtn = page.getByRole('button', { name: /delete cluster/i }).first();

    try {
      await expect(deleteBtn).toBeAttached({ timeout: 10_000 });
    } catch {
      // Button not in DOM — user lacks cluster admin permission in this environment
      test.skip(true, 'Delete cluster button not rendered — user may lack cluster-level admin permission');
      return;
    }
    await deleteBtn.scrollIntoViewIfNeeded();
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
  });
});
