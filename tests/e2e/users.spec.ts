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
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/loading/i)).toBeHidden({ timeout: 10_000 }).catch(() => {})
    await expect(page.getByRole('table').getByText(TEST_ADMIN.email).first()).toBeVisible({ timeout: 15_000 })
  })

  test('users page does not stay stuck on loading state for admin', async ({ page }) => {
    await login(page)
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Loading…')).toBeHidden()
  })

  test('admin sees Add User button', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: /users/i }).first().click()
    await expect(page).toHaveURL(/\/users/, { timeout: 10_000 })
    await expect(page.getByRole('button', { name: /add user/i })).toBeVisible({ timeout: 10_000 })
  })

  test('viewer is redirected away from /users', async ({ page }) => {
    await loginAsViewer(page)
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 15_000 })
    await page.goto('/users')

    await expect
      .poll(async () => {
        if (!/\/users(?:\/)?$/.test(page.url())) return 'redirected'
        const hasUserManagementHeading =
          (await page.getByRole('heading', { name: /user management/i }).count()) > 0
        return hasUserManagementHeading ? 'has-content' : 'blocked'
      }, { timeout: 20_000 })
      .not.toBe('has-content')
  })
})
