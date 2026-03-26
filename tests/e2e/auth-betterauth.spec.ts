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

  test('protected route logout then immediate login preserves safe returnUrl and redirects immediately', async ({ page }) => {
    await login(page)

    await page.goto('/clusters?view=grid')
    await expect(page).toHaveURL(/\/clusters\?view=grid/)

    await page.getByRole('button', { name: /logout|sign out|log out/i }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    await expect(page).toHaveURL(/returnUrl=%2Fclusters%3Fview%3Dgrid/, { timeout: 10_000 })

    await page.goto('/clusters?view=grid')
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fclusters%3Fview%3Dgrid/, { timeout: 10_000 })

    await page.getByLabel(/email/i).fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@voyager.local')
    await page.getByLabel(/password/i).fill(process.env.E2E_ADMIN_PASSWORD ?? 'admin123')
    await page.getByRole('button', { name: /sign in|log in|login/i }).click()

    await expect(page).toHaveURL(/\/clusters\?view=grid/, { timeout: 20_000 })
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 })
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 20_000 })
  })

  test('logout lands on loggedOut login page and re-login exits cleanly without redirect loop', async ({ page }) => {
    await login(page)

    await page.getByRole('button', { name: /logout|sign out|log out/i }).click()
    await expect(page).toHaveURL(/\/login\?loggedOut=1&loggedOutAt=\d+$/, { timeout: 10_000 })
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel(/password/i)).toBeVisible({ timeout: 10_000 })

    const loggedOutUrl = page.url()
    const loggedOutAt = new URL(loggedOutUrl).searchParams.get('loggedOutAt')
    expect(loggedOutAt).toMatch(/^\d+$/)

    await expect(page).toHaveURL(new RegExp(`/login\\?loggedOut=1&loggedOutAt=${loggedOutAt}$`))

    await page.getByLabel(/email/i).fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@voyager.local')
    await page.getByLabel(/password/i).fill(process.env.E2E_ADMIN_PASSWORD ?? 'admin123')
    await page.getByRole('button', { name: /sign in|log in|login/i }).click()

    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 })
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 20_000 })
  })

  test('expired session redirects to login', async ({ page, context }) => {
    await login(page)
    await context.clearCookies()
    await page.goto('/clusters')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })
})
