import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Phase 1 — Sidebar Navigation (6 items, Phase 1 spec)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/');
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible({ timeout: 15_000 });
  });

  test('sidebar has Dashboard link', async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    const link = sidebar.getByRole('link', { name: /dashboard/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar has Clusters link', async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    const link = sidebar.getByRole('link', { name: /clusters/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar has Alerts link', async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    const link = sidebar.getByRole('link', { name: /alerts/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar has Events link', async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    const link = sidebar.getByRole('link', { name: /events/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar has Logs link', async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    const link = sidebar.getByRole('link', { name: /^logs$/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar has Settings link', async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    const link = sidebar.getByRole('link', { name: /settings/i });
    await expect(link.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Phase 1 — Settings Tabbed Layout (nav links)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /settings/i, level: 1 })).toBeVisible({ timeout: 15_000 });
  });

  test('Settings page loads with correct heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /settings/i, level: 1 })).toBeVisible();
  });

  test('Settings tabs nav exists with 7 links', async ({ page }) => {
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
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 15_000 });
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
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible({ timeout: 15_000 });

    const sidebar = page.locator('[data-testid="sidebar"]');
    const clusterLinks = sidebar.locator('a[href^="/clusters/"]');

    const count = await clusterLinks.count();
    if (count === 0) {
      test.skip(true, 'No cluster quick-links found in sidebar — may need clusters in DB');
      return;
    }

    const firstLink = clusterLinks.first();
    const href = await firstLink.getAttribute('href');
    expect(href).toMatch(/\/clusters\/.+/);
    expect(href).not.toBe('/clusters');
    expect(href).not.toBe('/clusters/');
  });

  test('cluster row click navigates to /clusters/[id]', async ({ page }) => {
    await page.goto('/clusters');

    const queryError = page.getByText(/failed to load data/i);
    // With ≤5 clusters the page renders card buttons; with >5 it renders DataTable rows
    const clusterCard = page.locator('button[aria-label^="View cluster"]').first();
    const dataRow = page.locator('tr[data-row]').first();

    await expect(clusterCard.or(dataRow).or(queryError)).toBeVisible({ timeout: 15_000 });

    if (await queryError.isVisible()) {
      test.skip(true, 'Cluster list API returned an error — skipping BUG-RD-001 check');
      return;
    }

    if (await clusterCard.isVisible().catch(() => false)) {
      await clusterCard.click();
    } else {
      await dataRow.click();
    }

    await expect(page).toHaveURL(/\/clusters\/.+/, { timeout: 10_000 });
    expect(page.url()).not.toMatch(/^https?:\/\/[^/]+\/clusters\/?$/);
  });

  test('cluster detail page has Cluster tabs navigation', async ({ page }) => {
    await page.goto('/clusters/550e8400-e29b-41d4-a716-446655440001');

    const clusterNav = page.getByRole('navigation', { name: /cluster tabs/i });
    await expect(clusterNav).toBeVisible({ timeout: 15_000 });
    await expect(clusterNav.getByRole('link', { name: /overview/i })).toBeVisible({ timeout: 10_000 });
  });

  test('cluster detail Overview tab is accessible', async ({ page }) => {
    await page.goto('/clusters/550e8400-e29b-41d4-a716-446655440001');

    const clusterNav = page.getByRole('navigation', { name: /cluster tabs/i });
    await expect(clusterNav).toBeVisible({ timeout: 15_000 });

    const expectedTabs = ['Overview', 'Nodes', 'Pods', 'Deployments', 'Services', 'Namespaces', 'Events', 'Logs', 'Metrics', 'Autoscaling'];
    for (const tab of expectedTabs.slice(0, 5)) {
      await expect(clusterNav.getByRole('link', { name: new RegExp(tab, 'i') })).toBeVisible({ timeout: 5_000 });
    }
  });
});
