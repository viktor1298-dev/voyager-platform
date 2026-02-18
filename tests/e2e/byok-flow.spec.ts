import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.describe('BYOK key flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('AI page is gated when no valid BYOK key is available', async ({ page }) => {
    await page.goto('/ai')

    await expect(page.getByText('AI Chat Locked (BYOK)')).toBeVisible()
    await expect(page.getByRole('link', { name: /open settings/i })).toBeVisible()
    await expect(page.getByText(/valid saved api key|verifying saved byok key status/i)).toBeVisible()
  })

  test('Settings BYOK actions keep UX clear for saved key vs raw key', async ({ page }) => {
    await page.goto('/settings')

    const testButton = page.getByRole('button', { name: /test (new|saved) key/i })
    const saveButton = page.getByRole('button', { name: /save key/i })
    const apiKeyInput = page.getByLabel(/api key/i)
    const savedState = page.getByTestId('byok-saved-state')

    await expect(testButton).toBeDisabled()
    await expect(saveButton).toBeDisabled()
    await expect(savedState).toBeVisible()

    await apiKeyInput.fill('sk-test-123456789')

    await expect(page.getByRole('button', { name: /test new key/i })).toBeEnabled()
    await expect(saveButton).toBeEnabled()
  })
})
