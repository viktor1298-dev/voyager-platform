import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Permissions Page', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('admin can access /settings/permissions page', async ({ page }) => {
    await page.goto('/settings/permissions')
    await expect(page).toHaveURL(/\/settings\/permissions/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /^permissions$/i })).toBeVisible({ timeout: 15_000 })
  })
})
