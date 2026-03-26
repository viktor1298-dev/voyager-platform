import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://voyager-platform.voyagerlabs.co'
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@voyager.local'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin123'

test.describe('Authentication local-domain email validation', () => {
  test('allows seeded .local admin credentials to submit without client-side invalid-email error', async ({ page, context }) => {
    await context.clearCookies()
    await page.goto(`${BASE_URL}/metrics`)
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fmetrics/, { timeout: 20_000 })

    await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: /sign in|log in|login/i }).click()

    await expect(page.getByText('Invalid email address')).toHaveCount(0)
    await expect(page).toHaveURL(/\/metrics/, { timeout: 20_000 })
  })
})
