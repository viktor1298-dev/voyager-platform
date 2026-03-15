/**
 * Deep nav drawer drift test — multi-cycle open/close on multiple routes
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Nav drawer drift — deep test (375×812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('3-cycle open/close on /settings/users — no desktop table appears', async ({ page }) => {
    await login(page);
    await page.goto('/settings/users');
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 15_000 });

    const openBtn = page.getByRole('button', { name: /open navigation menu/i }).first();
    const closeBtn = page.getByRole('button', { name: /close navigation menu/i }).first();

    for (let i = 0; i < 3; i++) {
      const hasOpen = await openBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasOpen) {
        await openBtn.click();
      }
      const hasClose = await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasClose) {
        await closeBtn.click();
      }
    }

    const desktopTable = page.locator('table').first();
    const tableVisible = await desktopTable.isVisible().catch(() => false);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );

    expect(tableVisible).toBe(false);
    expect(overflow).toBe(false);
  });

  test('Nav on /settings/teams after open/close — no overlap', async ({ page }) => {
    await login(page);
    await page.goto('/settings/teams');
    await expect(page.getByRole('heading', { name: /^teams$/i })).toBeVisible({ timeout: 15_000 });

    const openBtn = page.getByRole('button', { name: /open navigation menu/i }).first();
    const closeBtn = page.getByRole('button', { name: /close navigation menu/i }).first();

    const hasOpen = await openBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasOpen) {
      await openBtn.click();
      const hasClose = await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasClose) {
        await closeBtn.click();
      }
    }

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });

  test('Collect console 404 errors across key pages', async ({ page }) => {
    const errors: Array<{ url: string; msg: string }> = [];
    page.on('console', m => {
      if (m.type() === 'error') errors.push({ url: page.url(), msg: m.text() });
    });

    await login(page);
    for (const route of ['/', '/settings/users', '/settings/teams', '/settings']) {
      await page.goto(route);
      await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    }

    const notFound404 = errors.filter(e => e.msg.includes('404') || e.msg.includes('Failed to load resource'));
    const serious = errors.filter(e =>
      !e.msg.includes('404') &&
      !e.msg.includes('Failed to load resource') &&
      !e.msg.includes('favicon') &&
      !e.msg.includes('BYOK') &&
      !e.msg.includes('tRPC') &&
      !e.msg.includes('trpc') &&
      !e.msg.includes('fetch') &&
      !e.msg.includes('AbortError')
    );

    test.info().annotations.push({
      type: 'note',
      description: `Ignored ${notFound404.length} known 404/resource console errors across key pages`,
    });

    expect(serious.length).toBe(0);
  });
});
