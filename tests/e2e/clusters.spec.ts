import { test, expect } from '@playwright/test';
import { login } from './helpers';

const CLUSTER_NAME = `test-e2e-${Date.now()}`;

test.describe('Clusters — CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should add a new cluster', async ({ page }) => {
    await page.goto('/clusters');
    await page.getByRole('button', { name: /add|create|new/i }).first().click();

    // Fill cluster form using placeholders
    await page.getByPlaceholder('production-us-east').fill(CLUSTER_NAME);
    await page.getByPlaceholder('https://k8s-api.example.com:6443').fill('https://k8s.test.local:6443');

    // Click the submit button inside the form
    await page.locator('form').getByRole('button', { name: /add cluster/i }).click();

    // Wait for modal to close and list to refresh
    await page.waitForTimeout(1500);
    await page.goto('/clusters');
    
    // The cluster appears in both mobile cards (hidden on desktop) and desktop table
    // Use getByRole('cell') to target the visible desktop table cell
    await expect(page.getByRole('cell', { name: CLUSTER_NAME })).toBeVisible({ timeout: 10_000 });
  });

  test('should view cluster detail', async ({ page }) => {
    await page.goto('/clusters');
    // Click the table cell with the cluster name
    await page.getByRole('cell', { name: CLUSTER_NAME }).click();
    await expect(page).toHaveURL(/\/clusters\/.+/);
    await expect(page.getByText(CLUSTER_NAME).first()).toBeVisible();
  });

  test('should delete the cluster', async ({ page }) => {
    await page.goto('/clusters');
    
    // Find the table row containing our cluster and its delete button
    const row = page.locator('tr', { hasText: CLUSTER_NAME });
    await expect(row).toBeVisible({ timeout: 5000 });
    
    // Click delete button in the row (icon button with title)
    await row.locator('button[title="Delete cluster"]').or(
      row.getByRole('button', { name: /delete/i })
    ).first().click();

    // Confirm deletion in dialog
    await page.getByRole('button', { name: /^delete$/i }).click();

    await expect(page.getByRole('cell', { name: CLUSTER_NAME })).not.toBeVisible({ timeout: 10_000 });
  });
});
