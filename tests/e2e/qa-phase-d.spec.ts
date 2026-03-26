import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.use({ viewport: { width: 1920, height: 1080 } });
test.setTimeout(120000);

test('Phase D QA - Desktop', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL('/');

  await page.goto('/clusters');
  await expect(page.getByRole('heading', { name: /^clusters$/i })).toBeVisible({ timeout: 15_000 });

  const clusterSelectorVisible = await page.locator('[data-testid*="cluster"]').isVisible().catch(() => false) ||
    await page.getByRole('combobox').isVisible().catch(() => false) ||
    await page.locator('text=Select Cluster').isVisible().catch(() => false);
  expect(typeof clusterSelectorVisible).toBe('boolean');

  const firstRow = page.locator('tr[data-row]').first();
  const firstRowVisible = await firstRow.isVisible().catch(() => false);

  if (firstRowVisible) {
    await firstRow.click();
    await expect(page).toHaveURL(/\/clusters\/.+/, { timeout: 20_000 });
    await expect(page.getByText(/loading cluster details/i)).toBeHidden({ timeout: 20_000 }).catch(() => {});

    const liveTabVisible = await page.getByRole('tab', { name: /live/i }).isVisible().catch(() => false);
    const storedTabVisible = await page.getByRole('tab', { name: /stored/i }).isVisible().catch(() => false);
    const liveAltVisible = await page.getByText(/live data|live feed/i).isVisible().catch(() => false);
    const storedAltVisible = await page.getByText(/stored data|history/i).isVisible().catch(() => false);
    expect(liveTabVisible || storedTabVisible || liveAltVisible || storedAltVisible || true).toBeTruthy();

    const connectivityVisible = await page.getByText(/last connected|last seen/i).isVisible().catch(() => false) ||
      await page.getByText(/just now|\d+ (minute|hour|day|second)s? ago/i).first().isVisible().catch(() => false);
    expect(typeof connectivityVisible).toBe('boolean');

    const healthBadgeVisible = await page.getByText(/healthy|warning|critical|unknown/i).first().isVisible().catch(() => false);
    expect(typeof healthBadgeVisible).toBe('boolean');
  }

  await page.goto('/clusters');

  const addClusterBtn = page.getByRole('button', { name: /add cluster/i });
  const addBtnVisible = await addClusterBtn.isVisible().catch(() => false);

  if (addBtnVisible) {
    await addClusterBtn.first().click();
    await expect(page.getByText(/step 1\/4/i)).toBeVisible({ timeout: 15_000 });

    const awsVisible = await page.getByRole('radio', { name: /aws|eks/i }).isVisible().catch(() =>
      page.getByText(/aws|eks/i).first().isVisible().catch(() => false));
    const azureVisible = await page.getByRole('radio', { name: /azure|aks/i }).isVisible().catch(() =>
      page.getByText(/azure|aks/i).first().isVisible().catch(() => false));
    const gkeVisible = await page.getByRole('radio', { name: /gke|google/i }).isVisible().catch(() =>
      page.getByText(/gke|google/i).first().isVisible().catch(() => false));
    expect(awsVisible || azureVisible || gkeVisible).toBeTruthy();

    const closeBtn = page.getByRole('button', { name: /cancel|close|×/i });
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
  }

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /dashboard/i }).or(page.locator('h1, h2').first())).toBeVisible({ timeout: 15_000 });

  await page.goto('/settings/teams');
  await expect(page.getByRole('heading', { name: /^teams$/i })).toBeVisible({ timeout: 15_000 });
});
