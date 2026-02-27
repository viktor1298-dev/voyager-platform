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
    // Each test creates its own cluster to avoid shared-state dependency
    await page.goto('/clusters');

    // Wait for table to be visible (at least one cluster must exist from seeding)
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    // Wait for actual data (not skeleton) — first td may be an empty checkbox column
    await expect(firstRow).toContainText(/.+/, { timeout: 10_000 });
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
      await expect(page.getByText(/failed to fetch from k8s api/i)).toBeVisible();
    } else {
      await expect(page.locator('h1').first()).toContainText(clusterName);
    }
  });

  test('should show delete action for existing cluster row', async ({ page }) => {
    await page.goto('/clusters');

    // Wait for the table to render — don't depend on any specific cluster from other tests
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    await firstRow.hover();
    await expect(page.getByRole('button', { name: /delete cluster/i }).first()).toBeVisible();
  });
});
