import { test, expect } from '@playwright/test'
import { login, loginAsViewer, ensureViewerExists } from './helpers'

test.describe('RBAC — Viewer Restrictions', () => {
  test.beforeAll(async () => {
    await ensureViewerExists()
  })

  test('viewer cannot see Add Cluster button on /clusters', async ({ page }) => {
    await loginAsViewer(page)
    await page.goto('/clusters')
    // Wait for the page to fully load with data
    await page.waitForLoadState('networkidle')
    // Verify we are logged in as Viewer User (confirms session loaded)
    await expect(page.getByText('Viewer User')).toBeVisible({ timeout: 10_000 })
    // Wait for clusters table to render (data loaded)
    await expect(page.locator('table').first()).toBeVisible({ timeout: 10_000 })
    // Now check that Add Cluster button is NOT visible
    const addBtn = page.getByRole('button', { name: /add cluster/i })
    await expect(addBtn).toHaveCount(0)
  })

  test('viewer cannot see delete cluster buttons', async ({ page }) => {
    await loginAsViewer(page)
    await page.goto('/clusters')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Viewer User')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('table').first()).toBeVisible({ timeout: 10_000 })
    // No delete buttons should be visible for viewer
    const deleteButtons = page.locator('button[title="Delete cluster"]')
    await expect(deleteButtons).toHaveCount(0)
  })

  test('viewer cannot see restart deployment button', async ({ page }) => {
    await loginAsViewer(page)
    await page.goto('/deployments')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Viewer User')).toBeVisible({ timeout: 10_000 })
    // Wait for deployments table/list to load
    await page.waitForTimeout(2000)
    // No restart buttons for viewer
    const restartButtons = page.getByRole('button', { name: /restart/i })
    await expect(restartButtons).toHaveCount(0)
  })

  test('admin CAN see Add Cluster button on /clusters', async ({ page }) => {
    await login(page)
    await page.goto('/clusters')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /add cluster/i })).toBeVisible({ timeout: 10_000 })
  })
})
