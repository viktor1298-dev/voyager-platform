import { test, expect } from '@playwright/test'
import { login, loginAsViewer, ensureViewerExists } from './helpers'

test.describe('Permissions Page — Admin Only', () => {
  test.beforeAll(async () => {
    await ensureViewerExists()
  })

  test('admin can access /permissions page', async ({ page }) => {
    await login(page)
    await page.goto('/permissions')

    await expect(page).toHaveURL(/\/permissions/, { timeout: 10_000 })
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: /^permissions$/i })).toBeVisible({ timeout: 10_000 })
  })

  test('viewer is redirected away from /permissions', async ({ page }) => {
    await loginAsViewer(page)
    await page.goto('/permissions')

    await expect(page).not.toHaveURL(/\/permissions/, { timeout: 10_000 })
  })
})
