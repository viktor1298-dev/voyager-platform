/**
 * Phase 2 — v194 E2E Tests: Enhanced Command Palette
 *
 * Tests: E2E-P2-013 through E2E-P2-016
 * Verifies command palette cluster-tab items and keyboard shortcuts
 *
 * Architecture:
 * - Cmd+K opens command palette (cmdk library)
 * - When on /clusters/[id], shows "Cluster Tabs" group with 10 tabs
 * - Keyboard 1-9 switches cluster tabs directly (no palette needed)
 * - [ and ] navigate prev/next cluster tab
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers';

const BASE_URL = process.env.BASE_URL ?? 'http://voyager-platform.voyagerlabs.co';
const TEST_CLUSTER_ID = '550e8400-e29b-41d4-a716-446655440000';

test.describe('Phase 2 — Enhanced Command Palette: Cluster Tab Items', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Navigate to cluster detail page
    await page.goto(`${BASE_URL}/clusters/${TEST_CLUSTER_ID}`);
    await expect(page.getByRole('navigation', { name: /cluster tabs/i })).toBeVisible({ timeout: 20_000 });
  });

  test('E2E-P2-013: Cmd+K palette includes cluster-tab items when in cluster detail', async ({ page }) => {
    // Open command palette with Ctrl+K (Linux/Windows equivalent of Cmd+K)
    await page.keyboard.press('Control+k');

    // Wait for palette to open
    const palette = page.locator('[role="dialog"], [cmdk-root], [data-cmdk-root]').first();
    await expect(palette).toBeVisible({ timeout: 5_000 });

    // Should contain "Cluster Tabs" group
    const clusterTabsGroup = page.locator('text=Cluster Tabs').first();
    await expect(clusterTabsGroup).toBeVisible({ timeout: 5_000 });

    // Should show all 10 cluster tab items
    const tabItems = ['Overview', 'Nodes', 'Pods', 'Deployments', 'Services', 'Namespaces', 'Events', 'Logs', 'Metrics', 'Autoscaling'];

    for (const tabName of tabItems.slice(0, 5)) { // Check first 5 to keep test fast
      await expect(page.locator(`[cmdk-item], [role="option"]`).filter({ hasText: tabName }).first()).toBeVisible({ timeout: 3_000 });
    }

    // Close palette
    await page.keyboard.press('Escape');
  });

  test('E2E-P2-014: Palette navigation: selecting cluster tab item navigates correctly', async ({ page }) => {
    // Open command palette
    await page.keyboard.press('Control+k');

    const palette = page.locator('[role="dialog"], [cmdk-root], [data-cmdk-root]').first();
    await expect(palette).toBeVisible({ timeout: 5_000 });

    // Find and focus the cmdk search input, then type
    const searchInput = palette.locator('input[type="text"], input[placeholder*="Search"], input').first();
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill('Deployments');

    // Wait for filtered result — cmdk items are filtered when search has text
    // The "Deployments" cluster tab should be visible after filtering
    await page.waitForTimeout(500); // Let cmdk filter render

    // Verify "Deployments" item is visible in the filtered list
    const deploymentItemInList = page.locator('[cmdk-item]').filter({ hasText: /Deployments/ });
    const altItem = page.locator('[role="option"]').filter({ hasText: /Deployments/ });

    // Check which selector works
    const deploymentVisible = await deploymentItemInList.count() > 0 || await altItem.count() > 0;
    expect(deploymentVisible).toBeTruthy();

    // Navigate to Deployments — use keyboard to move to the item and press Enter
    // Or directly click it
    const clickTarget = await deploymentItemInList.count() > 0
      ? deploymentItemInList.first()
      : altItem.first();

    await clickTarget.click();

    // Should navigate to deployments tab
    await expect(page).toHaveURL(new RegExp(`/clusters/${TEST_CLUSTER_ID}/deployments`), { timeout: 10_000 });

    // Verify the deployments tab nav is still visible
    const clusterNav = page.getByRole('navigation', { name: /cluster tabs/i });
    await expect(clusterNav).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Phase 2 — Keyboard Shortcuts: Tab Switching', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Start on cluster overview (tab 1)
    await page.goto(`${BASE_URL}/clusters/${TEST_CLUSTER_ID}`);
    await expect(page.getByRole('navigation', { name: /cluster tabs/i })).toBeVisible({ timeout: 20_000 });
  });

  test('E2E-P2-015: Keyboard 1-9 switches cluster tabs', async ({ page }) => {
    // Press "3" to go to Pods tab (index 2, which is tab 3: Overview=1, Nodes=2, Pods=3)
    await page.keyboard.press('3');
    await expect(page).toHaveURL(new RegExp(`/clusters/${TEST_CLUSTER_ID}/pods`), { timeout: 10_000 });

    // Press "4" to go to Deployments tab (index 3)
    await page.keyboard.press('4');
    await expect(page).toHaveURL(new RegExp(`/clusters/${TEST_CLUSTER_ID}/deployments`), { timeout: 10_000 });

    // Press "1" to go back to Overview tab
    await page.keyboard.press('1');
    await expect(page).toHaveURL(new RegExp(`/clusters/${TEST_CLUSTER_ID}(/overview)?$`), { timeout: 10_000 });
  });

  test('E2E-P2-016: [ and ] navigate prev/next cluster tab', async ({ page }) => {
    // Start on Overview (tab index 0)
    await expect(page).toHaveURL(new RegExp(`/clusters/${TEST_CLUSTER_ID}(/overview)?$`));

    // Press ] to go to next tab (Nodes, index 1)
    await page.keyboard.press(']');
    await expect(page).toHaveURL(new RegExp(`/clusters/${TEST_CLUSTER_ID}/nodes`), { timeout: 10_000 });

    // Press ] again to go to Pods (index 2)
    await page.keyboard.press(']');
    await expect(page).toHaveURL(new RegExp(`/clusters/${TEST_CLUSTER_ID}/pods`), { timeout: 10_000 });

    // Press [ to go back to Nodes (index 1)
    await page.keyboard.press('[');
    await expect(page).toHaveURL(new RegExp(`/clusters/${TEST_CLUSTER_ID}/nodes`), { timeout: 10_000 });

    // Press [ again to go back to Overview (index 0)
    await page.keyboard.press('[');
    await expect(page).toHaveURL(new RegExp(`/clusters/${TEST_CLUSTER_ID}(/overview)?$`), { timeout: 10_000 });
  });
});
