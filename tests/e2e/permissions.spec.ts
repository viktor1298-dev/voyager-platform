import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Permissions Page', () => {
  test.beforeEach(async ({ page }) => { await login(page) })
  
  test('admin can access /permissions page', async ({ page }) => {
    await page.goto('/permissions')
    await expect(page).toHaveURL(/\/permissions$/)
    await expect(page.getByRole('link', { name: /^Permissions$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible()
  })
})
