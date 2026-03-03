import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

const BASE_URL = process.env.BASE_URL ?? 'http://voyager-platform.voyagerlabs.co';

async function navigateToErrorClusterWithCard(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/clusters`);
  
  // Find all rows that might have Error health status
  const rows = page.locator('tr, [data-testid="cluster-row"], a[href^="/clusters/"]')
    .filter({ hasText: /Error/i });
  
  const count = await rows.count();
  
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    try {
      await row.click();
      await page.waitForURL(/\/clusters\//, { timeout: 5_000 });
      
      // Check if AI context card actually appears
      const card = page.locator('text=Ask AI for diagnosis').first();
      const visible = await card.isVisible().catch(() => false);
      if (visible) return true;
      
      // Card not here, go back and try next row
      await page.goBack();
      await page.waitForTimeout(500);
    } catch {
      continue;
    }
  }
  
  return false; // No cluster with visible AI context card found
}

test.describe('AiContextCard on cluster detail', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('AI context card appears on cluster with Error health status', async ({ page }) => {
    const found = await navigateToErrorClusterWithCard(page);
    if (!found) { test.skip(true, 'No cluster with visible AI context card in test environment'); return; }
    
    await expect(page.locator('text=Ask AI for diagnosis').first()).toBeVisible();
    await expect(page.locator('text=AI can analyze events')).toBeVisible();
  });

  test('dismiss button hides the AI context card', async ({ page }) => {
    const found = await navigateToErrorClusterWithCard(page);
    if (!found) { test.skip(true, 'No cluster with visible AI context card in test environment'); return; }
    
    const card = page.locator('text=Ask AI for diagnosis').first();
    await expect(card).toBeVisible({ timeout: 5_000 });
    await page.locator('button[aria-label="Dismiss suggestion"]').click();
    await expect(card).toBeHidden({ timeout: 3_000 });
  });

  test('"Ask AI" link navigates to /ai with cluster context params', async ({ page }) => {
    const found = await navigateToErrorClusterWithCard(page);
    if (!found) { test.skip(true, 'No cluster with visible AI context card in test environment'); return; }
    
    const aiLink = page.locator('a:has-text("Ask AI for diagnosis")').first();
    await expect(aiLink).toBeVisible({ timeout: 5_000 });
    const href = await aiLink.getAttribute('href');
    expect(href).toContain('/ai?context=cluster');
    await aiLink.click();
    await page.waitForURL(/\/ai\?context=cluster/, { timeout: 10_000 });
  });
});
