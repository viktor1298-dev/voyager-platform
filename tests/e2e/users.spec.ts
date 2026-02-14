import { test, expect } from '@playwright/test'
import { login, loginAsViewer, ensureViewerExists, TEST_ADMIN } from './helpers'

test.describe('Users Page — Admin Only', () => {
  test.beforeAll(async () => {
    await ensureViewerExists()
  })

  test('admin can access /users page', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: /users/i }).first().click()
    await expect(page).toHaveURL(/\/users/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 10_000 })
  })

  test('admin sees user list with at least one user', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: /users/i }).first().click()
    await expect(page).toHaveURL(/\/users/, { timeout: 10_000 })
    await expect(page.getByText(TEST_ADMIN.email)).toBeVisible({ timeout: 10_000 })
  })

  test('admin sees Add User button', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: /users/i }).first().click()
    await expect(page).toHaveURL(/\/users/, { timeout: 10_000 })
    await expect(page.getByRole('button', { name: /add user/i })).toBeVisible({ timeout: 10_000 })
  })

  test('viewer is redirected away from /users', async ({ page }) => {
    await loginAsViewer(page)
    await page.goto('/users')
    await expect(page).not.toHaveURL(/\/users/, { timeout: 10_000 })
  })
})
