import { test, expect } from '@playwright/test'
import { login, loginAsViewer, ensureViewerExists, AUTH_COOKIE_NAME } from './helpers'

test.describe('Better-Auth — Full Login/Logout Flow', () => {
  test.beforeAll(async () => {
    await ensureViewerExists()
  })

  test('full admin login → verify session → logout → verify redirect', async ({ page, context }) => {
    await login(page)
    await expect(page).not.toHaveURL(/\/login/)

    const cookies = await context.cookies()
    const sessionCookie = cookies.find((c) => c.name === AUTH_COOKIE_NAME)
    expect(sessionCookie).toBeTruthy()

    await page.getByRole('button', { name: /logout|sign out|log out/i }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

    const cookiesAfter = await context.cookies()
    const sessionAfter = cookiesAfter.find((c) => c.name === AUTH_COOKIE_NAME)
    expect(!sessionAfter || sessionAfter.value === '').toBeTruthy()

    await page.goto('/clusters')
    await expect(page).toHaveURL(/\/login/)
  })

  test('full viewer login → verify session → logout', async ({ page, context }) => {
    await loginAsViewer(page)
    await expect(page).not.toHaveURL(/\/login/)

    const cookies = await context.cookies()
    const sessionCookie = cookies.find((c) => c.name === AUTH_COOKIE_NAME)
    expect(sessionCookie).toBeTruthy()

    await page.getByRole('button', { name: /logout|sign out|log out/i }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('session persists across page navigation', async ({ page }) => {
    await login(page)
    await page.goto('/clusters')
    await expect(page).not.toHaveURL(/\/login/)
    await page.goto('/events')
    await expect(page).not.toHaveURL(/\/login/)
    await page.goto('/settings')
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('expired session redirects to login', async ({ page, context }) => {
    await login(page)
    await context.clearCookies()
    await page.goto('/clusters')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })
})
