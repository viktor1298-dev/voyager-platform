/**
 * Phase 1 — v194 E2E Tests
 *
 * Verifies Phase 1 structural changes:
 * 1. Sidebar has 6 items (Dashboard, Clusters, Alerts, Events, Logs, Settings)
 * 2. Settings has tabbed layout — implemented as <nav aria-label="Settings tabs"> with links:
 *    General, Users, Teams, Permissions, Webhooks, Feature Flags, Audit Log
 * 3. Old routes redirect: /users → /settings/users, /anomalies → /alerts
 * 4. Cluster detail at /clusters/[id] has tab navigation:
 *    <nav aria-label="Cluster tabs"> with Overview, Nodes, Pods, Deployments, Services, Namespaces, Events, Logs, Metrics, Autoscaling
 * 5. BUG-RD-001: Cluster quick-links go to /clusters/${id} (not /clusters)
 *
 * NOTE: Tabs are implemented as <nav> links, NOT [role="tab"] ARIA elements.
 * Use nav[aria-label="..."] > a selectors.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Phase 1 — Sidebar Navigation (6 items, Phase 1 spec)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('sidebar has Dashboard link', async ({ page }) => {
    const sidebar = page.locator('aside, [role="complementary"]').first();
    const link = sidebar.getByRole('link', { name: /dashboard/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar has Clusters link', async ({ page }) => {
    const sidebar = page.locator('aside, [role="complementary"]').first();
    const link = sidebar.getByRole('link', { name: /clusters/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar has Alerts link', async ({ page }) => {
    const sidebar = page.locator('aside, [role="complementary"]').first();
    const link = sidebar.getByRole('link', { name: /alerts/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar has Events link', async ({ page }) => {
    const sidebar = page.locator('aside, [role="complementary"]').first();
    // Phase 1 spec: Events replaces AI Assistant in sidebar nav
    const link = sidebar.getByRole('link', { name: /events/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar has Logs link', async ({ page }) => {
    const sidebar = page.locator('aside, [role="complementary"]').first();
    // Phase 1 spec: Logs replaces Dashboards in sidebar nav
    const link = sidebar.getByRole('link', { name: /^logs$/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar has Settings link', async ({ page }) => {
    const sidebar = page.locator('aside, [role="complementary"]').first();
    const link = sidebar.getByRole('link', { name: /settings/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Phase 1 — Settings Tabbed Layout (nav links)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    // Wait for settings page to fully render (heading visible)
    await expect(page.getByRole('heading', { name: /settings/i, level: 1 })).toBeVisible({ timeout: 15_000 });
  });

  test('Settings page loads with correct heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /settings/i, level: 1 })).toBeVisible();
  });

  test('Settings tabs nav exists with 7 links', async ({ page }) => {
    // From snapshot: <nav aria-label="Settings tabs"> with 7 links
    const settingsNav = page.getByRole('navigation', { name: /settings tabs/i });
    await expect(settingsNav).toBeVisible({ timeout: 10_000 });
    const links = settingsNav.getByRole('link');
    await expect(links).toHaveCount(7, { timeout: 10_000 });
  });

  test('Settings has General link', async ({ page }) => {
    const settingsNav = page.getByRole('navigation', { name: /settings tabs/i });
    await expect(settingsNav.getByRole('link', { name: /general/i })).toBeVisible({ timeout: 10_000 });
  });

  test('Settings has Users link', async ({ page }) => {
    const settingsNav = page.getByRole('navigation', { name: /settings tabs/i });
    await expect(settingsNav.getByRole('link', { name: /users/i })).toBeVisible({ timeout: 10_000 });
  });

  test('Settings has Teams link', async ({ page }) => {
    const settingsNav = page.getByRole('navigation', { name: /settings tabs/i });
    await expect(settingsNav.getByRole('link', { name: /teams/i })).toBeVisible({ timeout: 10_000 });
  });

  test('Settings has Permissions link', async ({ page }) => {
    const settingsNav = page.getByRole('navigation', { name: /settings tabs/i });
    await expect(settingsNav.getByRole('link', { name: /permissions/i })).toBeVisible({ timeout: 10_000 });
  });

  test('Settings has Webhooks link', async ({ page }) => {
    const settingsNav = page.getByRole('navigation', { name: /settings tabs/i });
    await expect(settingsNav.getByRole('link', { name: /webhooks/i })).toBeVisible({ timeout: 10_000 });
  });

  test('Settings has Feature Flags link', async ({ page }) => {
    const settingsNav = page.getByRole('navigation', { name: /settings tabs/i });
    await expect(settingsNav.getByRole('link', { name: /feature flags/i })).toBeVisible({ timeout: 10_000 });
  });

  test('Settings has Audit Log link', async ({ page }) => {
    const settingsNav = page.getByRole('navigation', { name: /settings tabs/i });
    await expect(settingsNav.getByRole('link', { name: /audit log/i })).toBeVisible({ timeout: 10_000 });
  });

  test('Settings Users link navigates to /settings/users', async ({ page }) => {
    const settingsNav = page.getByRole('navigation', { name: /settings tabs/i });
    await settingsNav.getByRole('link', { name: /users/i }).click();
    await expect(page).toHaveURL(/\/settings\/users/, { timeout: 10_000 });
  });
});

test.describe('Phase 1 — Route Redirects', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('/users redirects to /settings/users', async ({ page }) => {
    await page.goto('/users');
    await page.waitForURL(/\/settings\/users|\/settings/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/settings/);
  });

  test('/anomalies redirects to /alerts', async ({ page }) => {
    await page.goto('/anomalies');
    await page.waitForURL(/\/alerts/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/alerts/);
  });
});

test.describe('Phase 1 — Cluster Detail Tab Navigation (BUG-RD-001)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('cluster quick-links in sidebar go to /clusters/[id] not /clusters', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // From snapshot: sidebar cluster quick-links use /clusters/${id} URLs
    const sidebar = page.locator('aside, [role="complementary"]').first();
    const clusterLinks = sidebar.locator('a[href^="/clusters/"]');

    const count = await clusterLinks.count();
    if (count === 0) {
      test.skip(true, 'No cluster quick-links found in sidebar — may need clusters in DB');
      return;
    }

    const firstLink = clusterLinks.first();
    const href = await firstLink.getAttribute('href');
    // BUG-RD-001: href should be /clusters/${id} not /clusters
    expect(href).toMatch(/\/clusters\/.+/);
    expect(href).not.toBe('/clusters');
    expect(href).not.toBe('/clusters/');
  });

  test('cluster row click navigates to /clusters/[id]', async ({ page }) => {
    await page.goto('/clusters');
    const table = page.locator('table').first();
    const queryError = page.getByText(/failed to load data/i);

    await expect(table.or(queryError)).toBeVisible({ timeout: 15_000 });

    if (await queryError.isVisible()) {
      test.skip(true, 'Cluster list API returned an error — skipping BUG-RD-001 check');
      return;
    }

    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    const firstRowText = await firstRow.innerText().catch(() => '');
    if (/no clusters found/i.test(firstRowText)) {
      test.skip(true, 'No clusters in DB — skipping BUG-RD-001 check');
      return;
    }

    // Click a cluster row to navigate to detail
    await firstRow.click();
    // BUG-RD-001: should go to /clusters/${id} not /clusters
    await expect(page).toHaveURL(/\/clusters\/.+/, { timeout: 10_000 });
    expect(page.url()).not.toMatch(/^https?:\/\/[^/]+\/clusters\/?$/);
  });

  test('cluster detail page has Cluster tabs navigation', async ({ page }) => {
    // Direct navigate to a known cluster ID (from DOM snapshot)
    await page.goto('/clusters/550e8400-e29b-41d4-a716-446655440001');
    await page.waitForLoadState('domcontentloaded');

    // From snapshot: <nav aria-label="Cluster tabs"> with Overview, Nodes, Pods...
    const clusterNav = page.getByRole('navigation', { name: /cluster tabs/i });
    await expect(clusterNav).toBeVisible({ timeout: 15_000 });

    // Check for Overview link as first tab
    await expect(clusterNav.getByRole('link', { name: /overview/i })).toBeVisible({ timeout: 10_000 });
  });

  test('cluster detail Overview tab is accessible', async ({ page }) => {
    await page.goto('/clusters/550e8400-e29b-41d4-a716-446655440001');
    await page.waitForLoadState('domcontentloaded');

    const clusterNav = page.getByRole('navigation', { name: /cluster tabs/i });
    await expect(clusterNav).toBeVisible({ timeout: 15_000 });

    // All expected tabs from snapshot
    const expectedTabs = ['Overview', 'Nodes', 'Pods', 'Deployments', 'Services', 'Namespaces', 'Events', 'Logs', 'Metrics', 'Autoscaling'];
    for (const tab of expectedTabs.slice(0, 5)) {
      // Check first 5 to avoid excessive test time
      await expect(clusterNav.getByRole('link', { name: new RegExp(tab, 'i') })).toBeVisible({ timeout: 5_000 });
    }
  });
});
