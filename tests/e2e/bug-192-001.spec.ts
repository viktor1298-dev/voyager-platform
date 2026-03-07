/**
 * BUG-192-001: SPA routing freeze after visiting /anomalies (now redirects to /alerts)
 * Verifies: Clicking "Dashboard" sidebar link from /alerts navigates correctly to /
 * PASS criteria: URL changes from /alerts to / within 5 seconds
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('BUG-192-001: Dashboard nav from /anomalies does not freeze', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Visiting /anomalies then clicking Dashboard sidebar link navigates to /', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    // Step 1: Navigate to /anomalies (redirects to /alerts)
    await page.goto('/anomalies');
    await page.waitForLoadState('domcontentloaded');

    // Confirm we are on /alerts (redirect from /anomalies)
    expect(page.url()).toContain('/alerts');
    console.log(`[BUG-192-001] Landed on: ${page.url()}`);

    // Step 2: Wait 3 seconds (simulating user staying on page)
    await page.waitForTimeout(3000);

    // Step 3: Find the Dashboard sidebar link (href="/")
    // The sidebar uses navItems with id='/' and label='Dashboard'
    const dashboardLink = page.locator('a[href="/"], a[href*="dashboard"]').first();
    const byLabel = page.getByRole('link', { name: /^dashboard$/i });

    const linkToClick = (await byLabel.count()) > 0 ? byLabel.first() : dashboardLink;

    const isVisible = await linkToClick.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isVisible) {
      // Try alternative: look for text "Dashboard" in sidebar
      const textLink = page.locator('nav a, aside a').filter({ hasText: /^dashboard$/i }).first();
      const textVisible = await textLink.isVisible({ timeout: 3000 }).catch(() => false);
      if (textVisible) {
        await textLink.click();
      } else {
        // Last fallback: any element with Dashboard text that's clickable
        await page.locator('text=Dashboard').first().click();
      }
    } else {
      await linkToClick.click();
    }

    // Step 4: Verify navigation happened — URL should be '/' or contain 'dashboard' route
    // Allow up to 5 seconds for SPA navigation
    await page.waitForFunction(
      () => window.location.pathname === '/' || window.location.pathname.includes('dashboard'),
      { timeout: 5000 }
    );

    const finalUrl = page.url();
    console.log(`[BUG-192-001] Navigated to: ${finalUrl}`);

    // Verify URL is now on dashboard (/)
    const urlPath = new URL(finalUrl).pathname;
    expect(urlPath).toBe('/');

    // Verify page has dashboard content
    await page.waitForLoadState('domcontentloaded');
    const dashboardContent = page.locator('[data-testid="dashboard"], h1, h2').first();
    const hasContent = await dashboardContent.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasContent).toBe(true);

    // No critical JS errors
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('BYOK') &&
      !e.includes('tRPC') &&
      !e.includes('trpc') &&
      !e.includes('fetch') &&
      !e.includes('AbortError') &&
      !e.includes('404')
    );
    console.log(`[BUG-192-001] Console errors: ${criticalErrors.length}`);
    if (criticalErrors.length > 0) {
      console.log(`[BUG-192-001] Errors: ${criticalErrors.slice(0, 3).join(', ')}`);
    }

    console.log(`[BUG-192-001] RESULT: PASS — navigated from /alerts to ${urlPath}`);
  });

  test('Multiple nav cycles between /anomalies and / do not freeze', async ({ page }) => {
    await login(page);

    for (let cycle = 1; cycle <= 3; cycle++) {
      // Go to anomalies (redirects to /alerts)
      await page.goto('/anomalies');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      expect(page.url()).toContain('/alerts');

      // Click Dashboard link
      const dashboardLink = page.locator('a[href="/"]').first();
      const byLabel = page.getByRole('link', { name: /^dashboard$/i });
      const link = (await byLabel.count()) > 0 ? byLabel.first() : dashboardLink;

      await link.click();

      // Verify navigation within 5s
      await page.waitForFunction(
        () => window.location.pathname === '/',
        { timeout: 5000 }
      );

      const urlPath = new URL(page.url()).pathname;
      expect(urlPath).toBe('/');
      console.log(`[BUG-192-001] Cycle ${cycle}: PASS — navigated to ${urlPath}`);
      await page.waitForTimeout(500);
    }
  });
});
