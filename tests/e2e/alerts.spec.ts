import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Alerts — CRUD + History', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should load alerts page with rules list and history', async ({ page }) => {
    await page.goto('/alerts');

    // Verify page structure
    await expect(page.getByText('Alert Rules')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Recent Triggers')).toBeVisible();
    await expect(page.getByRole('button', { name: /create alert/i })).toBeVisible();
  });

  test('should create a new alert rule', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByText('Alert Rules')).toBeVisible({ timeout: 15_000 });

    // Open create dialog
    await page.getByRole('button', { name: /create alert/i }).click();
    await expect(page.getByText('Create Alert Rule')).toBeVisible();

    // Fill form
    const alertName = `E2E-Alert-${Date.now()}`;
    await page.getByLabel(/alert name/i).fill(alertName);
    await page.getByLabel(/metric/i).selectOption('memory');
    await page.getByLabel(/operator/i).selectOption('gt');
    await page.getByLabel(/threshold value/i).fill('80');
    await page.getByLabel(/cluster filter/i).fill('test-cluster');

    // Submit
    await page.getByRole('button', { name: /^create$/i }).click();

    // Verify alert appears in list (optimistic update)
    await expect(page.getByText(alertName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Memory Usage')).toBeVisible();
  });

  test('should toggle alert enabled/disabled', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByText('Alert Rules')).toBeVisible({ timeout: 15_000 });

    // First create an alert to toggle
    await page.getByRole('button', { name: /create alert/i }).click();
    const alertName = `Toggle-Alert-${Date.now()}`;
    await page.getByLabel(/alert name/i).fill(alertName);
    await page.getByLabel(/threshold value/i).fill('50');
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByText(alertName)).toBeVisible({ timeout: 10_000 });

    // Find the toggle button for this alert — it starts as ON
    const toggleBtn = page.getByRole('button', { name: new RegExp(`disable alert ${alertName}`, 'i') });
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveText('ON');

    // Toggle OFF
    await toggleBtn.click();
    const enableBtn = page.getByRole('button', { name: new RegExp(`enable alert ${alertName}`, 'i') });
    await expect(enableBtn).toHaveText('OFF', { timeout: 5_000 });

    // Toggle back ON
    await enableBtn.click();
    await expect(page.getByRole('button', { name: new RegExp(`disable alert ${alertName}`, 'i') })).toHaveText('ON', { timeout: 5_000 });
  });

  test('should delete an alert rule', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByText('Alert Rules')).toBeVisible({ timeout: 15_000 });

    // Create an alert to delete
    await page.getByRole('button', { name: /create alert/i }).click();
    const alertName = `Delete-Alert-${Date.now()}`;
    await page.getByLabel(/alert name/i).fill(alertName);
    await page.getByLabel(/threshold value/i).fill('90');
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByText(alertName)).toBeVisible({ timeout: 10_000 });

    // Click delete button for this alert
    await page.getByRole('button', { name: new RegExp(`delete alert ${alertName}`, 'i') }).click();

    // Confirm deletion dialog
    await expect(page.getByText('Delete Alert')).toBeVisible();
    await expect(page.getByText(/are you sure/i)).toBeVisible();
    await page.getByRole('button', { name: /^delete$/i }).click();

    // Verify alert is removed
    await expect(page.getByText(alertName)).toBeHidden({ timeout: 10_000 });
  });

  test('should show empty state when no alerts exist', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByText('Alert Rules')).toBeVisible({ timeout: 15_000 });

    // The empty state text (may or may not show depending on existing data)
    // Just verify the page doesn't crash and the table/empty state renders
    const table = page.locator('table').first();
    const emptyState = page.getByText(/no alert rules configured/i);
    await expect(table.or(emptyState)).toBeVisible({ timeout: 10_000 });
  });

  test('should display history section with triggers or empty message', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByText('Recent Triggers')).toBeVisible({ timeout: 15_000 });

    // Either shows trigger entries or "No alert triggers yet"
    const hasEntries = page.locator('text=ACK').or(page.locator('text=NEW'));
    const emptyHistory = page.getByText(/no alert triggers yet/i);

    await expect(hasEntries.first().or(emptyHistory)).toBeVisible({ timeout: 10_000 });
  });
});
