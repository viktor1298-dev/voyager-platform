import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

const BASE_URL = process.env.BASE_URL ?? 'http://voyager-platform.voyagerlabs.co';

/**
 * Find a cluster with Error health status from the clusters list page,
 * then navigate to its detail page.
 */
async function navigateToErrorCluster(page: Page): Promise<string> {
  await page.goto(`${BASE_URL}/clusters`);
  // Look for a row with "Error" health badge
  const errorBadge = page
    .locator('tr, [data-testid="cluster-row"], a[href^="/clusters/"]')
    .filter({ hasText: /Error/i })
    .first();
  await expect(errorBadge).toBeVisible({ timeout: 10_000 });
  // Click the row/link to navigate to the cluster detail
  await errorBadge.click();
  await page.waitForURL(/\/clusters\//, { timeout: 10_000 });
  return page.url();
}

test.describe('AiContextCard on cluster detail', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('AI context card appears on cluster with Error health status', async ({ page }) => {
    await navigateToErrorCluster(page);

    // The card should be visible with suggestion text
    const card = page.locator('text=Ask AI for diagnosis').first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    // Verify supporting text
    await expect(page.locator('text=AI can analyze events')).toBeVisible();
  });

  test('dismiss button hides the AI context card', async ({ page }) => {
    await navigateToErrorCluster(page);

    const card = page.locator('text=Ask AI for diagnosis').first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    // Click dismiss button
    const dismissBtn = page.locator('button[aria-label="Dismiss suggestion"]');
    await dismissBtn.click();

    // Card should disappear
    await expect(card).toBeHidden({ timeout: 3_000 });
  });

  test('"Ask AI" link navigates to /ai with cluster context params', async ({ page }) => {
    await navigateToErrorCluster(page);

    const aiLink = page.locator('a:has-text("Ask AI for diagnosis")').first();
    await expect(aiLink).toBeVisible({ timeout: 5_000 });

    // Verify the href contains expected query params
    const href = await aiLink.getAttribute('href');
    expect(href).toContain('/ai?context=cluster');
    expect(href).toContain('clusterId=');
    expect(href).toContain('clusterName=');

    // Click and verify navigation
    await aiLink.click();
    await page.waitForURL(/\/ai\?context=cluster/, { timeout: 10_000 });
    expect(page.url()).toContain('/ai?context=cluster');
  });
});
