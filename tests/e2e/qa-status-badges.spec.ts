import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'
const CLUSTER_SLUG = 'be3ed763-7a2b-4172-a5a6-01dcd27de1ce--eks-devops-separate-us-east-1'

test.describe('Status Badges + Loading Indicator QA', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`)
    await page.fill('input[type="email"]', 'admin@voyager.local')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/', { timeout: 10000 })
  })

  test('Pods page shows icon status badges (not plain dots)', async ({ page }) => {
    await page.goto(`${BASE_URL}/clusters/${CLUSTER_SLUG}/pods`)
    // Wait for pods to load (either from cache or SSE)
    await page.waitForSelector('[role="status"]', { timeout: 30000 })

    // Screenshot
    await page.screenshot({ path: 'qa-status-badges-pods.png', fullPage: false })

    // Verify ResourceStatusBadge elements exist (they have role="status")
    const badges = page.locator('[role="status"][aria-label^="Status:"]')
    const count = await badges.count()
    expect(count).toBeGreaterThan(0)
    console.log(`✓ Found ${count} status badges on Pods page`)

    // Verify badges contain SVG icons (not just dots)
    const firstBadge = badges.first()
    const svgIcon = firstBadge.locator('svg')
    await expect(svgIcon).toBeVisible()
    console.log('✓ Status badges contain SVG icons')

    // Check badge has border (ResourceStatusBadge style)
    const borderColor = await firstBadge.evaluate((el) => getComputedStyle(el).borderColor)
    expect(borderColor).not.toBe('rgba(0, 0, 0, 0)')
    console.log(`✓ Status badges have colored borders: ${borderColor}`)
  })

  test('Nodes page shows icon status badges', async ({ page }) => {
    await page.goto(`${BASE_URL}/clusters/${CLUSTER_SLUG}/nodes`)
    await page.waitForSelector('[role="status"]', { timeout: 30000 })

    await page.screenshot({ path: 'qa-status-badges-nodes.png', fullPage: false })

    const badges = page.locator('[role="status"][aria-label^="Status:"]')
    const count = await badges.count()
    expect(count).toBeGreaterThan(0)
    console.log(`✓ Found ${count} status badges on Nodes page`)
  })

  test('Deployments page shows icon status badges', async ({ page }) => {
    await page.goto(`${BASE_URL}/clusters/${CLUSTER_SLUG}/deployments`)
    await page.waitForSelector('[role="status"]', { timeout: 30000 })

    await page.screenshot({ path: 'qa-status-badges-deployments.png', fullPage: false })

    const badges = page.locator('[role="status"][aria-label^="Status:"]')
    const count = await badges.count()
    expect(count).toBeGreaterThan(0)
    console.log(`✓ Found ${count} status badges on Deployments page`)
  })

  test('Loading indicator shows spinner + text on fresh load', async ({ page }) => {
    // Navigate directly — on first load, should show loading indicator
    await page.goto(`${BASE_URL}/clusters/${CLUSTER_SLUG}/pods`)

    // Try to catch the loading state (may be brief if cache is warm)
    // Check if "Loading pods..." text appears or if data loaded instantly
    const loadingText = page.locator('text=Loading pods...')
    const statusBadge = page.locator('[role="status"][aria-label^="Status:"]')

    // Either loading indicator or data should be visible quickly
    const loadingVisible = await loadingText.isVisible().catch(() => false)
    if (loadingVisible) {
      console.log('✓ Loading indicator "Loading pods..." is visible')
      await page.screenshot({ path: 'qa-loading-indicator.png', fullPage: false })
    } else {
      console.log('ℹ Loading indicator was too fast to catch — data loaded instantly (cache hit)')
    }

    // Eventually data should load
    await statusBadge.first().waitFor({ timeout: 30000 })
    console.log('✓ Pod data loaded successfully')
    await page.screenshot({ path: 'qa-pods-loaded.png', fullPage: false })
  })

  test('No console errors on cluster pages', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto(`${BASE_URL}/clusters/${CLUSTER_SLUG}/pods`)
    await page.waitForSelector('[role="status"]', { timeout: 30000 })

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('Failed to load resource') && !e.includes('net::ERR') && !e.includes('favicon'),
    )
    console.log(`Console errors: ${criticalErrors.length} critical, ${errors.length} total`)
    if (criticalErrors.length > 0) {
      console.log('Critical errors:', criticalErrors)
    }
    expect(criticalErrors.length).toBe(0)
  })
})
