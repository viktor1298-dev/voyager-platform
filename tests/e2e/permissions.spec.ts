import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Permissions Page', () => {
  test.beforeEach(async ({ page }) => { await login(page) })
  
  test('admin can access /settings/permissions page', async ({ page }) => {
    // v194: Permissions is now under /settings/permissions (not a top-level sidebar item)
    // Navigate directly instead of clicking sidebar link
    await page.goto('/settings/permissions')
    await expect(page).toHaveURL(/\/settings\/permissions/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /^Permissions$/i })).toBeVisible({ timeout: 15_000 })
  })
})
