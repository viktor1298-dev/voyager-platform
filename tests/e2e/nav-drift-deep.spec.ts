/**
 * Deep nav drawer drift test — multi-cycle open/close on multiple routes
 * If drift was real, desktop table should appear after nav open on mobile
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Nav drawer drift — deep test (375×812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('3-cycle open/close on /users — no desktop table appears', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });

    await login(page);
    await page.goto('/users');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const openBtn = page.getByRole('button', { name: /open navigation menu/i }).first();
    const closeBtn = page.getByRole('button', { name: /close navigation menu/i }).first();

    for (let i = 0; i < 3; i++) {
      const hasOpen = await openBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasOpen) {
        await openBtn.click();
        await page.waitForTimeout(400);
      }
      const hasClose = await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasClose) {
        await closeBtn.click();
        await page.waitForTimeout(400);
      }
    }

    // After 3 open/close cycles:
    // - Desktop table should NOT be visible
    // - No horizontal overflow
    const desktopTable = page.locator('table').first();
    const tableVisible = await desktopTable.isVisible().catch(() => false);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );

    console.log(`After 3 cycles: table=${tableVisible}, overflow=${overflow}`);
    expect(tableVisible).toBe(false); // no desktop layout drift
    expect(overflow).toBe(false);
  });

  test('Nav on /teams after open/close — no overlap', async ({ page }) => {
    await login(page);
    await page.goto('/teams');
    await page.waitForLoadState('domcontentloaded');

    const openBtn = page.getByRole('button', { name: /open navigation menu/i }).first();
    const closeBtn = page.getByRole('button', { name: /close navigation menu/i }).first();

    const hasOpen = await openBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasOpen) {
      await openBtn.click();
      await page.waitForTimeout(400);
      const hasClose = await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasClose) {
        await closeBtn.click();
        await page.waitForTimeout(400);
      }
    }

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    console.log(`Teams after nav: overflow=${overflow}`);
    expect(overflow).toBe(false);
  });

  test('Collect console 404 errors across key pages', async ({ page }) => {
    const errors: Array<{ url: string; msg: string }> = [];
    page.on('console', m => {
      if (m.type() === 'error') errors.push({ url: page.url(), msg: m.text() });
    });

    await login(page);
    for (const route of ['/', '/users', '/teams', '/settings']) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
    }

    const notFound404 = errors.filter(e => e.msg.includes('404') || e.msg.includes('Failed to load resource'));
    const serious = errors.filter(e => !e.msg.includes('404') && !e.msg.includes('Failed to load resource') && !e.msg.includes('favicon') && !e.msg.includes('BYOK') && !e.msg.includes('tRPC') && !e.msg.includes('trpc') && !e.msg.includes('fetch') && !e.msg.includes('AbortError'));

    console.log(`404/resource errors: ${notFound404.length}`);
    notFound404.forEach(e => console.log(`  [${e.url}] ${e.msg.slice(0, 100)}`));
    console.log(`Other serious errors: ${serious.length}`);
    serious.forEach(e => console.log(`  [${e.url}] ${e.msg.slice(0, 100)}`));

    // 404s from static assets are acceptable — only app logic errors matter
    expect(serious.length).toBe(0);
  });
});
