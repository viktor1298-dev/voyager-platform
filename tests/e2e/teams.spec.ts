import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Teams Page', () => {
  test.beforeEach(async ({ page }) => { await login(page) })
  
  test('admin can access /teams page', async ({ page }) => {
    await page.goto('/teams')
    await expect(page.locator('h1')).toContainText(/teams/i)
  })
})
