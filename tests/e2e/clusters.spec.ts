import { test, expect } from '@playwright/test';
import { login } from './helpers';

const CLUSTER_NAME = `test-cluster-${Date.now()}`;

test.describe('Clusters — CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should add a new cluster', async ({ page }) => {
    await page.goto('/clusters');
    await page.getByRole('button', { name: /add|create|new/i }).click();

    // Fill cluster form
    await page.getByLabel(/name/i).fill(CLUSTER_NAME);
    const apiUrlField = page.getByLabel(/api.*url|endpoint|server/i);
    if (await apiUrlField.isVisible()) {
      await apiUrlField.fill('https://k8s.test.local:6443');
    }

    await page.getByRole('button', { name: /save|create|add|submit/i }).click();

    // Verify it appears in the list
    await page.goto('/clusters');
    await expect(page.getByText(CLUSTER_NAME)).toBeVisible({ timeout: 10_000 });
  });

  test('should view cluster detail', async ({ page }) => {
    await page.goto('/clusters');
    await page.getByText(CLUSTER_NAME).click();
    await expect(page).toHaveURL(/\/clusters\/.+/);
    await expect(page.getByText(CLUSTER_NAME)).toBeVisible();
  });

  test('should delete the cluster', async ({ page }) => {
    await page.goto('/clusters');
    const row = page.locator('tr, [data-testid="cluster-row"]', { hasText: CLUSTER_NAME });
    await row.getByRole('button', { name: /delete|remove/i }).click();

    // Confirm deletion if dialog appears
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i });
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.getByText(CLUSTER_NAME)).not.toBeVisible({ timeout: 10_000 });
  });
});
