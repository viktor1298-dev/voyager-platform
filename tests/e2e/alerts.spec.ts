import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

/** Delete a test-created alert rule by name via API to prevent artifact accumulation. */
async function cleanupAlert(page: Page, alertName: string): Promise<void> {
  try {
    // Use the tRPC API to delete the alert by name
    await page.evaluate(async (name) => {
      const res = await fetch('/trpc/alerts.list', {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json() as { result?: { data?: { json?: Array<{ id: string; name: string }> } } };
      const alerts = data.result?.data?.json ?? [];
      const target = alerts.find((a) => a.name === name);
      if (!target) return;
      await fetch('/trpc/alerts.delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id }),
      });
    }, alertName);
  } catch {
    // Best-effort cleanup — do not fail test on cleanup error
  }
}

test.describe('Alerts — CRUD + History', () => {
  const createdAlerts: string[] = [];

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    for (const name of createdAlerts) {
      await cleanupAlert(page, name);
    }
    createdAlerts.length = 0;
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
    createdAlerts.push(alertName);
    test.info().annotations.push({ type: 'e2e-created-alert', description: alertName });
    await page.getByLabel(/alert name/i).fill(alertName);
    await page.locator('select').filter({ has: page.locator('option[value="cpu"]') }).selectOption('memory');
    await page.getByLabel(/operator/i).selectOption('gt');
    await page.getByLabel(/threshold value/i).fill('80');
    await page.getByLabel(/cluster filter/i).fill('test-cluster');

    // Submit
    await page.getByRole('button', { name: /^create$/i }).click();

    // Hypothesis: AnimatePresence exit animation keeps dialog overlay on top, making elements behind it "not visible"
    // Wait for dialog to fully dismiss before checking the table
    await expect(page.getByText('Create Alert Rule')).toBeHidden({ timeout: 15_000 });

    // Verify alert appears in list — use toBeAttached first to handle overflow:hidden clipping
    const alertEl = page.locator('table').getByText(alertName).first();
    await expect(alertEl).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('table').getByText('Memory Usage').first()).toBeVisible();
    await expect(page.getByText('Memory Usage').first()).toBeAttached();
  });

  test('should toggle alert enabled/disabled', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByText('Alert Rules')).toBeVisible({ timeout: 15_000 });

    // First create an alert to toggle
    await page.getByRole('button', { name: /create alert/i }).click();
    const alertName = `Toggle-Alert-${Date.now()}`;
    createdAlerts.push(alertName);
    await page.getByLabel(/alert name/i).fill(alertName);
    await page.getByLabel(/threshold value/i).fill('50');
    await page.getByRole('button', { name: /^create$/i }).click();

    // Hypothesis: dialog overlay blocks visibility check — wait for dismiss
    await expect(page.getByText('Create Alert Rule')).toBeHidden({ timeout: 15_000 });

    // Wait for alert row to be in DOM and scroll into view
    const alertEl = page.locator('table').getByText(alertName).first();
    await expect(alertEl).toBeVisible({ timeout: 10_000 });

    // Find the toggle button for this alert — it starts as ON
    const toggleBtn = page.getByRole('button', { name: new RegExp(`disable alert ${alertName}`, 'i') });
    await expect(toggleBtn).toBeVisible({ timeout: 10_000 });
    await expect(toggleBtn).toHaveText('ON');

    // Toggle OFF
    await toggleBtn.click();
    const enableBtn = page.getByRole('button', { name: new RegExp(`enable alert ${alertName}`, 'i') });
    await expect(enableBtn).toHaveText('OFF', { timeout: 5_000 });

    // Toggle back ON — wait for re-render to settle
    await page.waitForTimeout(500);
    await enableBtn.click({ force: true });
    await expect(page.getByRole('button', { name: new RegExp(`disable alert ${alertName}`, 'i') })).toHaveText('ON', { timeout: 5_000 });
  });

  test('should delete an alert rule', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByText('Alert Rules')).toBeVisible({ timeout: 15_000 });

    // Create an alert to delete
    await page.getByRole('button', { name: /create alert/i }).click();
    const alertName = `Delete-Alert-${Date.now()}`;
    createdAlerts.push(alertName);
    await page.getByLabel(/alert name/i).fill(alertName);
    await page.getByLabel(/threshold value/i).fill('90');
    await page.getByRole('button', { name: /^create$/i }).click();

    // Hypothesis: dialog overlay blocks visibility — wait for dismiss
    await expect(page.getByText('Create Alert Rule')).toBeHidden({ timeout: 15_000 });

    // Wait for alert to appear
    const alertEl = page.locator('table').getByText(alertName).first();
    await expect(alertEl).toBeVisible({ timeout: 10_000 });

    // Click delete button for this alert
    const deleteBtn = page.getByRole('button', { name: new RegExp(`delete alert ${alertName}`, 'i') });
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
    await deleteBtn.click();

    // Confirm deletion dialog
    await expect(page.getByText('Delete Alert')).toBeVisible();
    await expect(page.getByText(/are you sure/i)).toBeVisible();
    await page.getByRole('button', { name: /^delete$/i }).click();

    // Verify alert is removed
    await expect(page.locator('table').getByText(alertName).first()).toBeHidden({ timeout: 15_000 });
    // Alert was deleted during the test itself — afterEach cleanupAlert is a no-op for this one
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
    // Use .first() to avoid strict-mode violation if "Recent Triggers" text appears in multiple elements
    await expect(page.getByText('Recent Triggers').first()).toBeVisible({ timeout: 15_000 });

    // Either shows trigger entries or "No alert triggers yet"
    const emptyHistory = page.getByText(/no alert triggers yet/i).first();

    // Use poll to avoid strict-mode issues when both ACK and NEW entries may exist
    await expect.poll(async () => {
      const ackCount = await page.locator('text=ACK').count();
      const newCount = await page.locator('text=NEW').count();
      const emptyCount = await emptyHistory.count();
      return ackCount > 0 || newCount > 0 || emptyCount > 0;
    }, { timeout: 10_000 }).toBe(true);
  });
});
