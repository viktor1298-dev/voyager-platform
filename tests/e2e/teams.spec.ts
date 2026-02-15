import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Teams Page', () => {
  test.beforeEach(async ({ page }) => { await login(page) })
  
  test('admin can access /teams page', async ({ page }) => {
    await page.goto('/teams')
    await expect(page).toHaveURL(/\/teams$/)
    await expect(page.getByRole('link', { name: /^Teams$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible()
  })
})
