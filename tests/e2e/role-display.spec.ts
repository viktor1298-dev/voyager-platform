import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('User Role Display', () => {
  test('should display admin role badge for admin user', async ({ page }) => {
    await login(page)
    // Navigate to settings or profile page where role is displayed
    await page.goto('/settings')
    await page.waitForLoadState('domcontentloaded')
    // Admin user should see admin badge/label
    await expect(
      page.getByText(/admin/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('should show admin controls on clusters page', async ({ page }) => {
    await login(page)
    await page.goto('/clusters')
    await page.waitForLoadState('domcontentloaded')
    // Admin should see add cluster button (admin control)
    await expect(
      page.getByRole('button', { name: /add|create|new/i }).first()
    ).toBeVisible({ timeout: 10_000 })
  })
})
