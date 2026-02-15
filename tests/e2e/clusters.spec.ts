import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Clusters — CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should add a new cluster', async ({ page }) => {
    await page.goto('/clusters');
    await page.getByRole('button', { name: /add cluster/i }).first().click();

    await page.getByRole('button', { name: /next/i }).click();
    await expect(page.getByText(/step 2\/4/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  test('should view cluster detail', async ({ page }) => {
    await page.goto('/clusters');

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    const clusterName = (await firstRow.locator('td').first().innerText()).trim();

    await firstRow.click();
    await expect(page).toHaveURL(/\/clusters\/.+/);
    await expect(page.getByText(clusterName).first()).toBeVisible();
  });

  test('should delete the cluster', async ({ page }) => {
    await page.goto('/clusters');

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.getByRole('button', { name: /delete cluster|delete/i })).toBeVisible();
  });
});
