import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Teams Page', () => {
  test.beforeEach(async ({ page }) => { await login(page) })
  
  test('admin can access /teams page', async ({ page }) => {
    const teamsLink = page.getByRole('link', { name: /^Teams$/i })
    await teamsLink.waitFor({ state: 'visible', timeout: 30_000 })
    await teamsLink.evaluate((el) => (el as HTMLAnchorElement).click())
    await expect(page).toHaveURL(/\/teams$/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /^Teams$/i })).toBeVisible({ timeout: 15_000 })
  })
})
