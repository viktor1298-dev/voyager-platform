import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Permissions Page', () => {
  test.beforeEach(async ({ page }) => { await login(page) })
  
  test('admin can access /permissions page', async ({ page }) => {
    const permissionsLink = page.getByRole('link', { name: /^Permissions$/i })
    await permissionsLink.waitFor({ state: 'visible', timeout: 30_000 })
    await permissionsLink.evaluate((el) => (el as HTMLAnchorElement).click())
    await expect(page).toHaveURL(/\/permissions$/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /^Permissions$/i })).toBeVisible({ timeout: 15_000 })
  })
})
