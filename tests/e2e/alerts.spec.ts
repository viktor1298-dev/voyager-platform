import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

/** Delete a test-created alert rule by name via API to prevent artifact accumulation. */
async function cleanupAlert(page: Page, alertName: string): Promise<void> {
  try {
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

    await expect(page.getByRole('heading', { name: /alert rules/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /recent triggers/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /create alert/i })).toBeVisible({ timeout: 15_000 });
  });

  test('should create a new alert rule', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByRole('heading', { name: /alert rules/i })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /create alert/i }).click();
    await expect(page.getByRole('heading', { name: /create alert rule/i })).toBeVisible({ timeout: 15_000 });

    const alertName = `E2E-Alert-${Date.now()}`;
    createdAlerts.push(alertName);
    test.info().annotations.push({ type: 'e2e-created-alert', description: alertName });
    await page.getByLabel(/alert name/i).fill(alertName);
    await page.locator('select').filter({ has: page.locator('option[value="cpu"]') }).selectOption('memory');
    await page.getByLabel(/operator/i).selectOption('gt');
    await page.getByLabel(/threshold value/i).fill('80');
    await page.getByLabel(/cluster filter/i).fill('test-cluster');

    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByRole('heading', { name: /create alert rule/i })).toBeHidden({ timeout: 15_000 });

    const alertRow = page.locator('tr').filter({ hasText: alertName }).first();
    await expect(alertRow).toBeVisible({ timeout: 10_000 });
    await expect(alertRow).toContainText(/memory/i);
  });

  test('should toggle alert enabled/disabled', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByRole('heading', { name: /alert rules/i })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /create alert/i }).click();
    const alertName = `Toggle-Alert-${Date.now()}`;
    createdAlerts.push(alertName);
    await page.getByLabel(/alert name/i).fill(alertName);
    await page.getByLabel(/threshold value/i).fill('50');
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByRole('heading', { name: /create alert rule/i })).toBeHidden({ timeout: 15_000 });

    const alertRow = page.locator('tr').filter({ hasText: alertName }).first();
    await expect(alertRow).toBeVisible({ timeout: 10_000 });

    const toggleBtn = page.getByRole('button', { name: new RegExp(`disable alert ${alertName}`, 'i') });
    await expect(toggleBtn).toBeVisible({ timeout: 10_000 });
    await expect(toggleBtn).toHaveText('ON');

    await toggleBtn.click();
    const enableBtn = page.getByRole('button', { name: new RegExp(`enable alert ${alertName}`, 'i') });
    await expect(enableBtn).toHaveText('OFF', { timeout: 5_000 });

    await enableBtn.click();
    await expect(page.getByRole('button', { name: new RegExp(`disable alert ${alertName}`, 'i') })).toHaveText('ON', { timeout: 5_000 });
  });

  test('should delete an alert rule', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByRole('heading', { name: /alert rules/i })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /create alert/i }).click();
    const alertName = `Delete-Alert-${Date.now()}`;
    createdAlerts.push(alertName);
    await page.getByLabel(/alert name/i).fill(alertName);
    await page.getByLabel(/threshold value/i).fill('90');
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByRole('heading', { name: /create alert rule/i })).toBeHidden({ timeout: 15_000 });

    const alertRow = page.locator('tr').filter({ hasText: alertName }).first();
    await expect(alertRow).toBeVisible({ timeout: 10_000 });

    const deleteBtn = page.getByRole('button', { name: new RegExp(`delete alert ${alertName}`, 'i') });
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
    await deleteBtn.click();

    await expect(page.getByRole('heading', { name: /delete alert/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/are you sure/i)).toBeVisible();
    await page.getByRole('button', { name: /^delete$/i }).click();

    await expect(page.locator('tr').filter({ hasText: alertName })).toHaveCount(0, { timeout: 15_000 });
  });

  test('should show empty state when no alerts exist', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByRole('heading', { name: /alert rules/i })).toBeVisible({ timeout: 15_000 });

    const table = page.locator('table').first();
    const emptyState = page.getByText(/no alert rules configured/i);
    await expect(table.or(emptyState)).toBeVisible({ timeout: 10_000 });
  });

  test('should display history section with triggers or empty message', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByRole('heading', { name: /recent triggers/i })).toBeVisible({ timeout: 15_000 });

    const emptyHistory = page.getByText(/no alert triggers yet/i).first();

    await expect.poll(async () => {
      const ackCount = await page.getByText('ACK').count();
      const newCount = await page.getByText('NEW').count();
      const emptyCount = await emptyHistory.count();
      return ackCount > 0 || newCount > 0 || emptyCount > 0;
    }, { timeout: 10_000 }).toBe(true);
  });
});
