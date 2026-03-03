import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

const BASE_URL = process.env.BASE_URL ?? 'http://voyager-platform.voyagerlabs.co';

async function navigateToErrorCluster(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/clusters`);
  const errorBadge = page
    .locator('tr, [data-testid="cluster-row"], a[href^="/clusters/"]')
    .filter({ hasText: /Error/i })
    .first();

  try {
    await errorBadge.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return false;
  }

  await errorBadge.click();
  await page.waitForURL(/\/clusters\//, { timeout: 10_000 });
  return true;
}

test.describe('AiContextCard on cluster detail', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('AI context card appears on cluster with Error health status', async ({ page }) => {
    const found = await navigateToErrorCluster(page);
    if (!found) { test.skip(true, 'No Error-status cluster in test environment'); return; }

    const card = page.locator('text=Ask AI for diagnosis').first();
    await expect(card).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=AI can analyze events')).toBeVisible();
  });

  test('dismiss button hides the AI context card', async ({ page }) => {
    const found = await navigateToErrorCluster(page);
    if (!found) { test.skip(true, 'No Error-status cluster in test environment'); return; }

    const card = page.locator('text=Ask AI for diagnosis').first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    const dismissBtn = page.locator('button[aria-label="Dismiss suggestion"]');
    await dismissBtn.click();
    await expect(card).toBeHidden({ timeout: 3_000 });
  });

  test('"Ask AI" link navigates to /ai with cluster context params', async ({ page }) => {
    const found = await navigateToErrorCluster(page);
    if (!found) { test.skip(true, 'No Error-status cluster in test environment'); return; }

    const aiLink = page.locator('a:has-text("Ask AI for diagnosis")').first();
    await expect(aiLink).toBeVisible({ timeout: 5_000 });

    const href = await aiLink.getAttribute('href');
    expect(href).toContain('/ai?context=cluster');
    expect(href).toContain('clusterId=');
    expect(href).toContain('clusterName=');

    await aiLink.click();
    await page.waitForURL(/\/ai\?context=cluster/, { timeout: 10_000 });
    expect(page.url()).toContain('/ai?context=cluster');
  });
});
