import { test, expect } from '@playwright/test'
import { login, loginAsViewer, ensureViewerExists, TEST_ADMIN } from './helpers'

test.describe('Users Page — Admin Only', () => {
  test.beforeAll(async () => {
    await ensureViewerExists()
  })

  test('admin can access /users page', async ({ page }) => {
    await login(page)
    await page.goto('/users')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 10_000 })
  })

  test('admin sees user list with at least one user', async ({ page }) => {
    await login(page)
    await page.goto('/users')
    await page.waitForLoadState('networkidle')
    // Should see at least the admin user in the table
    await expect(page.getByText(TEST_ADMIN.email)).toBeVisible({ timeout: 10_000 })
  })

  test('admin sees Add User button', async ({ page }) => {
    await login(page)
    await page.goto('/users')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /add user/i })).toBeVisible()
  })

  test('viewer is redirected away from /users', async ({ page }) => {
    await loginAsViewer(page)
    await page.goto('/users')
    // Should be redirected to / (non-admin redirect)
    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })
})
