import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Teams Page', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('admin can access /settings/teams page', async ({ page }) => {
    await page.goto('/settings/teams')
    await expect(page).toHaveURL(/\/settings\/teams/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /^teams$/i })).toBeVisible({ timeout: 15_000 })
  })
})
