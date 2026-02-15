import { test, expect } from '@playwright/test'
import { login, loginAsViewer, ensureViewerExists } from './helpers'

test.describe('Teams Page — Admin Only', () => {
  test.beforeAll(async () => {
    await ensureViewerExists()
  })

  test('admin can access /teams page', async ({ page }) => {
    await login(page)
    await page.goto('/teams')

    await expect(page).toHaveURL(/\/teams/, { timeout: 10_000 })
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 })
  })

  test('admin sees teams list in access-control navigation', async ({ page }) => {
    await login(page)
    await page.goto('/teams')

    await expect(page).toHaveURL(/\/teams/, { timeout: 10_000 })
    await expect(page.getByRole('link', { name: /^teams$/i })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: /^permissions$/i })).toBeVisible({ timeout: 10_000 })
  })

  test('viewer is redirected away from /teams', async ({ page }) => {
    await loginAsViewer(page)
    await page.goto('/teams')

    await expect(page).not.toHaveURL(/\/teams/, { timeout: 10_000 })
  })
})
