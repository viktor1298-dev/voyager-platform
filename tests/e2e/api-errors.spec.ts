import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('API Error Handling', () => {
  test('should show error toast when API request fails', async ({ page }) => {
    await login(page)

    // Intercept clusters API and return 500
    await page.route('**/trpc/clusters*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Internal Server Error', code: 'INTERNAL_SERVER_ERROR' },
        }),
      }),
    )

    await page.goto('/clusters')
    await page.waitForLoadState('networkidle')

    // Should display an error message (toast, alert, or inline)
    await expect(
      page
        .locator('[role="alert"], [data-sonner-toast], .toast, [data-testid="error"], .error-message')
        .first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('should show not found page for invalid routes', async ({ page }) => {
    await login(page)
    await page.goto('/this-page-does-not-exist-12345')
    await page.waitForLoadState('networkidle')

    // Should show 404 or "not found" text
    await expect(
      page.getByText(/not found|404|page doesn.*exist/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('should handle network timeout gracefully', async ({ page }) => {
    await login(page)

    // Abort all tRPC requests to simulate network failure
    await page.route('**/trpc/**', (route) => route.abort('connectionfailed'))

    await page.goto('/clusters')
    await page.waitForLoadState('domcontentloaded')

    // Wait for error UI to appear (loading should eventually fail)
    await expect(
      page
        .locator('[role="alert"], [data-sonner-toast], .toast, [data-testid="error"], .error-message, :text-matches("error|failed|unavailable", "i")')
        .first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('should redirect to login on 401 unauthorized', async ({ page, context }) => {
    await login(page)

    // Clear cookies to simulate expired session
    await context.clearCookies()

    // Intercept API calls to return 401
    await page.route('**/trpc/**', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
        }),
      }),
    )

    await page.goto('/clusters')

    // Should redirect to login or show unauthorized message
    await expect(
      page.getByText(/sign in|log in|unauthorized|session expired/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })
})
