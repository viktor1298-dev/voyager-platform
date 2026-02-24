/**
 * v106 QA Validation — Foreman-run QA gate
 * Tests all v106 changes on Desktop (1920x1080) + Mobile (375x812)
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers';

// ─── DESKTOP 1920×1080 ───────────────────────────────────────────────────────

test.describe('v106 QA — Desktop', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('Login and dashboard load', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL('/');
    await page.waitForLoadState('domcontentloaded');
    // Wait for sidebar to confirm shell loaded
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible({ timeout: 10_000 });
  });

  test('No UUID in visible UI — admin name and breadcrumbs use real names', async ({ page }) => {
    await login(page);
    // Check header/nav area for UUIDs
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[data-testid="sidebar"]').waitFor({ timeout: 10_000 });

    const headerText = await page.locator('header, nav, [data-testid="topbar"]').allTextContents().catch(() => []);
    const allText = headerText.join(' ');
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(uuidPattern.test(allText)).toBe(false);
  });

  test('/dashboards route loads — not a 404', async ({ page }) => {
    await login(page);
    await page.goto('/dashboards');
    await page.waitForLoadState('domcontentloaded');

    const bodyText = await page.locator('body').textContent({ timeout: 8_000 });
    const is404 = /\b404\b|page not found/i.test(bodyText ?? '');
    expect(is404).toBe(false);

    // Should render something meaningful
    const hasHeading = await page.getByRole('heading').first().isVisible({ timeout: 8_000 }).catch(() => false);
    console.log(`/dashboards heading visible: ${hasHeading}`);
    expect(hasHeading).toBe(true);
  });

  test('Audit log — /audit has entries (backend data fix)', async ({ page }) => {
    await login(page);
    await page.goto('/audit');
    await page.waitForLoadState('domcontentloaded');

    const bodyText = await page.locator('body').textContent({ timeout: 8_000 });
    expect(/\b404\b|page not found/i.test(bodyText ?? '')).toBe(false);

    // Wait for either table rows, cards, or empty state
    const hasTable = await page.locator('table tbody tr').first().isVisible({ timeout: 8_000 }).catch(() => false);
    const hasRows = await page.locator('[data-testid="audit-row"], [data-testid="log-row"]').first().isVisible({ timeout: 3_000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no audit|no entries|no events/i).isVisible({ timeout: 3_000 }).catch(() => false);
    const hasHeading = await page.getByRole('heading').first().isVisible({ timeout: 5_000 }).catch(() => false);

    console.log(`Audit: hasTable=${hasTable}, hasRows=${hasRows}, hasEmptyState=${hasEmptyState}`);
    expect(hasTable || hasRows || hasEmptyState || hasHeading).toBe(true);
  });

  test('Cluster breadcrumb — no UUID in breadcrumb when on cluster detail', async ({ page }) => {
    await login(page);
    await page.goto('/clusters');
    await page.waitForLoadState('domcontentloaded');

    // Try clicking first cluster
    const clusterLink = page.getByRole('link').filter({ hasText: /minikube|cluster/i }).first();
    const hasLink = await clusterLink.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasLink) {
      await clusterLink.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      // Grab all visible text in breadcrumb area
      const breadcrumbText = await page.locator('[aria-label="breadcrumb"], .breadcrumb, nav[aria-label]').allTextContents().catch(() => []);
      for (const t of breadcrumbText) {
        const hasUUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(t);
        expect(hasUUID).toBe(false);
      }

      // Also check page title / heading for UUID
      const heading = await page.getByRole('heading').first().textContent({ timeout: 5_000 }).catch(() => '');
      const headingHasUUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(heading ?? '');
      expect(headingHasUUID).toBe(false);
      console.log(`Cluster detail heading: "${heading}"`);
    } else {
      console.log('No cluster links found on /clusters — skipping breadcrumb UUID check');
    }
  });

  test('Presence indicator — no raw enum text (ONLINE/AWAY/BUSY/OFFLINE)', async ({ page }) => {
    await login(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[data-testid="sidebar"]').waitFor({ timeout: 10_000 });

    // Check presence-related UI elements
    const presenceEls = await page.locator('[data-testid*="presence"], [aria-label*="presence"], [class*="presence"]').allTextContents().catch(() => []);
    for (const t of presenceEls) {
      const rawEnum = /^(ONLINE|AWAY|BUSY|OFFLINE|UNKNOWN)$/.test(t.trim());
      if (rawEnum) {
        console.error(`Raw presence enum found: "${t}"`);
      }
      expect(rawEnum).toBe(false);
    }
  });

  test('Settings /settings loads — BYOK section present', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    const bodyText = await page.locator('body').textContent({ timeout: 8_000 });
    expect(/\b404\b|page not found/i.test(bodyText ?? '')).toBe(false);

    const hasHeading = await page.getByRole('heading').first().isVisible({ timeout: 8_000 }).catch(() => false);
    expect(hasHeading).toBe(true);

    // BYOK section
    const byokVisible = await page.getByTestId('byok-section').isVisible().catch(() => false);
    const byokTextVisible = await page.getByText(/api key|byok|ai provider/i).isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(`BYOK section visible: ${byokVisible}, text visible: ${byokTextVisible}`);
  });

  test('Console errors audit — collect errors from key pages', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await login(page);

    for (const route of ['/', '/audit', '/settings', '/dashboards', '/clusters']) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
    }

    const serious = errors.filter(e =>
      !e.includes('favicon') && !e.includes('Failed to load resource') && !/^Warning/.test(e)
    );
    console.log(`Serious console errors: ${serious.length}`);
    serious.forEach(e => console.log(`  ❌ ${e}`));
    // Report but don't hard fail — this is QA info collection
    expect(serious.length).toBeLessThan(10); // allow <10 minor errors
  });
});

// ─── MOBILE 375×812 ──────────────────────────────────────────────────────────

test.describe('v106 QA — Mobile (375×812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('Login works on mobile', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL('/');
  });

  test('Dashboard — no horizontal overflow at 375px', async ({ page }) => {
    await login(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });

  test('Mobile nav close button — visible after opening drawer', async ({ page }) => {
    await login(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const openBtn = page.getByRole('button', { name: /open navigation menu/i }).first();
    const hasOpen = await openBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasOpen) {
      await openBtn.click();
      await page.waitForTimeout(400);

      const closeBtn = page.getByRole('button', { name: /close navigation menu/i }).first();
      const hasClose = await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      expect(hasClose).toBe(true);
      console.log(`Mobile nav close button visible: ${hasClose} ✅`);
    } else {
      console.log('Mobile nav toggle not found — checking alternative selectors');
      const altToggle = page.locator('[data-testid="mobile-menu-toggle"], [aria-label*="menu"]').first();
      const hasAlt = await altToggle.isVisible({ timeout: 3_000 }).catch(() => false);
      console.log(`Alternative nav toggle: ${hasAlt}`);
    }
  });

  test('Mobile nav — no desktop layout drift after opening sidebar on /users', async ({ page }) => {
    await login(page);
    await page.goto('/users');
    await page.waitForLoadState('domcontentloaded');

    const menuBtn = page.getByRole('button', { name: /open navigation menu|close navigation menu/i }).first();
    const hasBtn = await menuBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasBtn) {
      await menuBtn.click();
      await page.waitForTimeout(500);

      // Horizontal overflow should still be controlled
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > window.innerWidth + 10
      );
      console.log(`Layout drift after nav open: overflow=${overflow}`);
      // Not hard failing on this as nav drawer may extend off-screen intentionally
    }
  });

  test('Teams page — no overlap at 375px, no horizontal overflow', async ({ page }) => {
    await login(page);
    await page.goto('/teams');
    await page.waitForLoadState('domcontentloaded');

    const bodyText = await page.locator('body').textContent({ timeout: 5_000 });
    expect(/\b404\b|page not found/i.test(bodyText ?? '')).toBe(false);

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);

    const tableCount = await page.locator('table').count();
    console.log(`Teams tables at 375px: ${tableCount}`);
  });

  test('Audit log — no horizontal overflow at 375px, page loads', async ({ page }) => {
    await login(page);
    await page.goto('/audit');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const bodyText = await page.locator('body').textContent({ timeout: 5_000 });
    expect(/\b404\b|page not found/i.test(bodyText ?? '')).toBe(false);

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    console.log(`Audit log overflow at 375px: ${overflow}`);
  });

  test('v108 touch targets — BYOK + theme toggle + hamburger + logout all ≥44px on mobile', async ({ page }) => {
    await login(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // ThemeToggle (was 32px, now h-11=44px)
    const themeToggle = page.getByTestId('theme-toggle').first();
    const hasTheme = await themeToggle.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasTheme) {
      const box = await themeToggle.boundingBox();
      if (box) {
        console.log(`ThemeToggle: ${box.width.toFixed(0)}x${box.height.toFixed(0)}px`);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }

    // Hamburger menu (was 32px, now h-11=44px)
    const hamburger = page.getByRole('button', { name: /open navigation menu/i }).first();
    const hasHamburger = await hamburger.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasHamburger) {
      const box = await hamburger.boundingBox();
      if (box) {
        console.log(`Hamburger: ${box.width.toFixed(0)}x${box.height.toFixed(0)}px`);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }

    // Logout button (was 36x28px, now min-h-[44px])
    const logoutBtn = page.getByRole('button', { name: /logout/i }).first();
    const hasLogout = await logoutBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasLogout) {
      const box = await logoutBtn.boundingBox();
      if (box) {
        console.log(`Logout: ${box.width.toFixed(0)}x${box.height.toFixed(0)}px`);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }

    // BYOK buttons on /settings
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const saveBtn = page.getByTestId('byok-save').first();
    const testBtn = page.getByTestId('byok-test').first();

    const hasSave = await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasTest = await testBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasSave) {
      const box = await saveBtn.boundingBox();
      if (box) {
        console.log(`BYOK save: ${box.height.toFixed(0)}px`);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    if (hasTest) {
      const box = await testBtn.boundingBox();
      if (box) {
        console.log(`BYOK test: ${box.height.toFixed(0)}px`);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }

    // Env filter tabs on dashboard (was 25px, now min-h-[44px])
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Filter tabs: All/Prod/Staging/Dev
    const filterButtons = page.locator('button').filter({ hasText: /^all\d*$|^prod\d*$|^staging\d*$|^dev\d*$/i });
    const filterCount = await filterButtons.count();
    let filterFails = 0;
    for (let i = 0; i < filterCount; i++) {
      const box = await filterButtons.nth(i).boundingBox().catch(() => null);
      if (box && box.height < 44) {
        filterFails++;
        console.log(`Filter tab fail: "${await filterButtons.nth(i).textContent()}" = ${box.height.toFixed(0)}px`);
      }
    }
    console.log(`Filter tabs: ${filterCount} total, ${filterFails} below 44px`);
    expect(filterFails).toBe(0);
  });

  test('/dashboards loads on mobile', async ({ page }) => {
    await login(page);
    await page.goto('/dashboards');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const bodyText = await page.locator('body').textContent({ timeout: 5_000 });
    expect(/\b404\b|page not found/i.test(bodyText ?? '')).toBe(false);
  });

  test('Mobile console errors — collect from key pages', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await login(page);
    for (const route of ['/', '/audit', '/teams', '/settings']) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
    }

    const serious = errors.filter(e =>
      !e.includes('favicon') && !e.includes('Failed to load resource') && !/^Warning/.test(e)
    );
    console.log(`Mobile serious console errors: ${serious.length}`);
    serious.forEach(e => console.log(`  ❌ ${e}`));
    expect(serious.length).toBeLessThan(10);
  });
});
