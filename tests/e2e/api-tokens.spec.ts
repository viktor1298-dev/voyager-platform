import { test, expect } from '@playwright/test'

test.describe('API Tokens', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@voyager.local')
    await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? 'admin123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/(dashboard|$)/, { timeout: 15000 })
    // Navigate to Settings > API Tokens
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'API Tokens' }).click()
    await page.waitForTimeout(300)
  })

  test('displays API Tokens section in settings', async ({ page }) => {
    await expect(page.getByText('Existing Tokens')).toBeVisible()
    await expect(page.getByText('Create Token')).toBeVisible()
    await expect(page.getByText('MCP Integration')).toBeVisible()
  })

  test('can create a new API token', async ({ page }) => {
    const tokenName = `test-token-${Date.now()}`
    await page.getByLabel('Token name').fill(tokenName)
    const createPromise = page.waitForResponse((r) => r.url().includes('trpc') && r.ok(), { timeout: 15000 })
    await page.getByRole('button', { name: /Create Token|Generate Token/i }).click()
    await createPromise
    // Token should appear once in a reveal banner
    await expect(page.locator('p', { hasText: /shown once|will not be shown again/i }).first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button', { hasText: /copy token/i }).first()).toBeVisible({ timeout: 5000 })
  })

  test('newly created token appears in the token list', async ({ page }) => {
    const tokenName = `list-test-${Date.now()}`
    await page.getByLabel('Token name').fill(tokenName)
    const createPromise = page.waitForResponse((r) => r.url().includes('trpc') && r.ok(), { timeout: 15000 })
    await page.getByRole('button', { name: /Create Token|Generate Token/i }).click()
    await createPromise
    await expect(page.locator('p', { hasText: /shown once|will not be shown again/i }).first()).toBeVisible({ timeout: 10000 })
    // Dismiss the reveal banner and wait for token list to refresh
    // Wait for dismiss button to be accessible
    await page.getByRole('button', { name: /Dismiss token/i }).waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /Dismiss token/i }).click()
    await page.waitForTimeout(1000)
    // Token name should now appear in the list
    await expect(page.getByText(tokenName)).toBeVisible({ timeout: 15000 })
  })

  test('can revoke a token with confirmation', async ({ page }) => {
    // First create a token to revoke
    const tokenName = `revoke-test-${Date.now()}`
    await page.getByLabel('Token name').fill(tokenName)
    const createPromise = page.waitForResponse((r) => r.url().includes('trpc') && r.ok(), { timeout: 15000 })
    await page.getByRole('button', { name: /Create Token|Generate Token/i }).click()
    await createPromise
    await expect(page.locator('p', { hasText: /shown once|will not be shown again/i }).first()).toBeVisible({ timeout: 10000 })
    // Wait for dismiss button to be accessible
    await page.getByRole('button', { name: /Dismiss token/i }).waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /Dismiss token/i }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByText(tokenName)).toBeVisible({ timeout: 15000 })
    // Click the per-token Revoke button (not the bulk "Revoke N Test Tokens" button)
    await page.getByRole('button', { name: `Revoke token ${tokenName}` }).click()
    await expect(page.getByRole('button', { name: /Confirm/i })).toBeVisible()
    await page.getByRole('button', { name: /Confirm/i }).click()
    // Token should disappear from list
    await expect(page.getByText(tokenName)).not.toBeVisible({ timeout: 10000 })
  })
})
