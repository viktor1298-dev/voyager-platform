import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Auth Advanced Flows', () => {
  test('should logout and redirect to login', async ({ page }) => {
    await login(page)

    // Find and click logout button
    const logoutBtn = page.getByRole('button', { name: /logout|sign out|log out/i })
    await logoutBtn.click()

    // Verify redirect to /login
    await expect(page).toHaveURL(/\/login/)

    // Verify accessing /clusters redirects back to /login
    await page.goto('/clusters')
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect to login when accessing protected page without auth', async ({ page }) => {
    await page.goto('/clusters')
    await expect(page).toHaveURL(/\/login/)
  })

  test('should stay logged in after page refresh', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.reload()
    // Verify still on dashboard, not redirected to login
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('should show validation errors on empty cluster form', async ({ page }) => {
    await login(page)
    await page.goto('/clusters')

    // Open the add cluster dialog/form
    await page.getByRole('button', { name: /add|create|new/i }).first().click()

    // Submit without filling fields
    await page.locator('form').getByRole('button', { name: /add cluster/i }).click()

    // Verify validation errors are shown (required fields)
    await expect(page.locator('[data-field-error], .text-destructive, [role="alert"]').first()).toBeVisible()
  })
})
