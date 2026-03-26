import { test, expect } from '@playwright/test'
import { login, loginAsViewer, ensureViewerExists } from './helpers'

test.describe('RBAC — Viewer Restrictions', () => {
  test.beforeAll(async () => {
    await ensureViewerExists()
  })

  test('viewer cannot see Add Cluster button on /clusters', async ({ page }) => {
    await loginAsViewer(page)
    await page.goto('/clusters')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })

    const addBtn = page.getByRole('button', { name: /add cluster/i })
    await expect(addBtn).toHaveCount(0)
  })

  test('viewer cannot see delete cluster buttons', async ({ page }) => {
    await loginAsViewer(page)
    await page.goto('/clusters')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })

    const deleteButtons = page.getByRole('button', { name: /delete cluster/i })
    await expect(deleteButtons).toHaveCount(0)
  })

  test('viewer cannot see restart deployment button', async ({ page }) => {
    await loginAsViewer(page)
    await page.goto('/deployments')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })

    const restartButtons = page.getByRole('button', { name: /restart/i })
    await expect(restartButtons).toHaveCount(0)
  })

  test('admin CAN see Add Cluster button on /clusters', async ({ page }) => {
    await login(page)
    await page.goto('/clusters')
    await expect(page.getByRole('heading', { name: /^clusters$/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /add cluster/i })).toBeVisible({ timeout: 10_000 })
  })
})
