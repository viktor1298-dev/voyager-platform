import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Teams Page', () => {
  test.beforeEach(async ({ page }) => { await login(page) })
  
  test('admin can access /settings/teams page', async ({ page }) => {
    // Teams is no longer a top-level sidebar item (v194 moved it under /settings)
    // Navigate directly to the new route
    await page.goto('/settings/teams')
    await expect(page).toHaveURL(/\/settings\/teams/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /^Teams$/i })).toBeVisible({ timeout: 15_000 })
  })
})
