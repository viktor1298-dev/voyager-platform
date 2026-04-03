import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Auth Advanced Flows', () => {
  test('should logout and redirect to login', async ({ page }) => {
    await login(page)

    const logoutBtn = page.getByRole('button', { name: /logout|sign out|log out/i })
    await logoutBtn.click()

    await expect(page).toHaveURL(/\/login/)

    await page.goto('/clusters')
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect to login when accessing protected page without auth', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()

    await page.goto('/clusters')
    await expect(page).toHaveURL(/\/login/)

    await context.close()
  })

  test('should stay logged in after page refresh', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.reload()
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 20_000 })
  })

  test('should show validation errors on empty cluster form', async ({ page }) => {
    await login(page)
    await page.goto('/clusters')
    await expect(page.getByRole('heading', { name: /^clusters$/i })).toBeVisible({
      timeout: 15_000,
    })

    await page
      .getByRole('button', { name: /add cluster/i })
      .first()
      .click()
    await page.getByRole('button', { name: 'Go to next step' }).click()

    const nextButton = page.getByRole('button', { name: 'Go to next step' })
    await expect(nextButton).toBeDisabled()
    await expect(page.getByText(/fill the required credential fields to continue/i)).toBeVisible()
  })
})
