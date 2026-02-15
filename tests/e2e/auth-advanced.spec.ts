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

    await page.getByRole('button', { name: /add cluster/i }).first().click()

    // New flow is a wizard: advance to kubeconfig step and verify empty state blocks progress
    await page.getByRole('button', { name: /next/i }).click()

    const nextButton = page.getByRole('button', { name: /next/i })
    await expect(nextButton).toBeDisabled()
    await expect(page.getByText(/fill the required credential fields to continue/i)).toBeVisible()
  })
})
