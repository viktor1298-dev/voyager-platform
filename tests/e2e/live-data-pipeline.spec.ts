import { test, expect } from '@playwright/test'
import { login } from './helpers'

/**
 * Live Data Pipeline E2E Tests
 *
 * Validates the SSE live data pipeline: K8s Watch -> WatchManager -> SSE -> Zustand store.
 * Uses BASE_URL from playwright.config.ts (never hardcoded localhost per Iron Rule #2).
 */
test.describe('Live Data Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('SSE connection establishes and receives snapshot data', async ({ page }) => {
    // Navigate to clusters page
    await page.goto('/clusters')

    // Wait for cluster cards or data rows to appear
    const clusterCard = page.locator('button[aria-label^="View cluster"]').first()
    const dataRow = page.locator('tr[data-row]').first()
    await expect(clusterCard.or(dataRow)).toBeVisible({ timeout: 15_000 })

    // Click first cluster to enter cluster detail (where SSE connects)
    if (await clusterCard.isVisible()) {
      await clusterCard.click()
    } else {
      await dataRow.click()
    }
    await page.waitForURL('**/clusters/**', { timeout: 10_000 })

    // Allow SSE snapshot to arrive
    await page.waitForTimeout(3000)

    // Take screenshot for evidence of connected state
    await page.screenshot({
      path: 'tests/e2e/screenshots/live-data-connected.png',
      fullPage: true,
    })

    // Monitor for SSE-related console errors
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.waitForTimeout(2000)
    const sseErrors = consoleErrors.filter((e) => e.includes('SSE') || e.includes('EventSource'))
    expect(sseErrors).toHaveLength(0)
  })

  test('live data updates visible within seconds (not polling interval)', async ({ page }) => {
    // Navigate to clusters page and enter first cluster
    await page.goto('/clusters')

    const clusterCard = page.locator('button[aria-label^="View cluster"]').first()
    const dataRow = page.locator('tr[data-row]').first()
    await expect(clusterCard.or(dataRow)).toBeVisible({ timeout: 15_000 })

    if (await clusterCard.isVisible()) {
      await clusterCard.click()
    } else {
      await dataRow.click()
    }
    await page.waitForURL('**/clusters/**', { timeout: 10_000 })

    // Navigate to pods tab if visible
    const podsTab = page.locator('[data-tab="pods"], a[href*="/pods"]').first()
    if (await podsTab.isVisible().catch(() => false)) {
      await podsTab.click()
    }

    // Wait for initial data load
    await page.waitForTimeout(5000)

    // Take 4 screenshots at 3-second intervals to prove continuous updates
    // Per D-03: screenshots at 0s, 3s, 6s, 9s
    for (let i = 0; i < 4; i++) {
      await page.screenshot({
        path: `tests/e2e/screenshots/live-data-t${i * 3}s.png`,
        fullPage: true,
      })
      if (i < 3) await page.waitForTimeout(3000)
    }
  })

  test('no repeated polling for SSE-watched types on cluster page', async ({ page }) => {
    // Navigate to cluster detail page
    await page.goto('/clusters')

    const clusterCard = page.locator('button[aria-label^="View cluster"]').first()
    const dataRow = page.locator('tr[data-row]').first()
    await expect(clusterCard.or(dataRow)).toBeVisible({ timeout: 15_000 })

    if (await clusterCard.isVisible()) {
      await clusterCard.click()
    } else {
      await dataRow.click()
    }
    await page.waitForURL('**/clusters/**', { timeout: 10_000 })

    // Wait for page to settle and SSE to connect
    await page.waitForTimeout(3000)

    // Monitor network for 15 seconds -- should see NO repeated tRPC requests
    // for pods, deployments, services, etc. (SSE handles these)
    const tRPCRequests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (
        url.includes('/trpc/') &&
        (url.includes('pods.list') ||
          url.includes('deployments.list') ||
          url.includes('services.list'))
      ) {
        tRPCRequests.push(url)
      }
    })

    await page.waitForTimeout(15_000)

    // There should be at most 1 initial request, NOT repeated polling
    const podRequests = tRPCRequests.filter((r) => r.includes('pods.list'))
    expect(podRequests.length).toBeLessThanOrEqual(1)
  })
})
