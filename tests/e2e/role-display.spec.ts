import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('User Role Display', () => {
  test('should display admin role badge for admin user', async ({ page }) => {
    await login(page)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /^settings$/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/admin/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('should show admin controls on clusters page', async ({ page }) => {
    await login(page)
    await page.goto('/clusters')
    await expect(page.getByRole('heading', { name: /^clusters$/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /add cluster/i })).toBeVisible({ timeout: 10_000 })
  })
})
