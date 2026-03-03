import { expect, test } from '@playwright/test'
import { login } from './helpers'

const BASE_URL = process.env.BASE_URL || 'http://localhost:9000'

/** Get the session cookie value after login */
async function getSessionCookie(page: import('@playwright/test').Page) {
  const cookies = await page.context().cookies()
  return cookies.find((c) => c.name === 'better-auth.session_token')?.value
}

/** Delete all BYOK keys via API */
async function deleteAllKeys(page: import('@playwright/test').Page) {
  const cookie = await getSessionCookie(page)
  if (!cookie) return
  for (const provider of ['openai', 'claude']) {
    try {
      await page.evaluate(
        async ({ url, ck, prov }) => {
          await fetch(`${url}/trpc/aiKeys.delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: `better-auth.session_token=${ck}` },
            body: JSON.stringify({ provider: prov }),
          })
        },
        { url: BASE_URL, ck: cookie, prov: provider },
      )
    } catch {
      // Key may not exist — that's fine
    }
  }
}

/** Seed a BYOK key via API so tests that need a saved key start with one */
async function seedByokKey(page: import('@playwright/test').Page) {
  const cookie = await getSessionCookie(page)
  if (!cookie) throw new Error('No session cookie — cannot seed BYOK key')
  await page.evaluate(
    async ({ url, ck }) => {
      await fetch(`${url}/trpc/aiKeys.save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `better-auth.session_token=${ck}` },
        body: JSON.stringify({ provider: 'openai', apiKey: 'sk-test-seeded-key-123', model: 'gpt-4o-mini' }),
      })
    },
    { url: BASE_URL, ck: cookie },
  )
}

test.describe('BYOK key flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('AI page is gated when no valid BYOK key is available', async ({ page }) => {
    // Ensure no keys exist so the gated UI renders
    await page.goto('/settings') // navigate first so cookies are available
    await deleteAllKeys(page)

    await page.goto('/ai')

    await expect(page.getByText('AI Chat Locked (BYOK)')).toBeVisible()
    await expect(page.getByRole('link', { name: /open settings/i })).toBeVisible()
    await expect(page.getByText(/valid saved api key|verifying saved byok key status/i).first()).toBeVisible()
  })

  test('Settings BYOK actions keep UX clear for saved key vs raw key', async ({ page }) => {
    // Seed a key so "Test Saved Key" button is enabled
    await page.goto('/settings')
    await seedByokKey(page)
    await page.reload()
    // Navigate to AI Configuration tab where BYOK settings live
    await page.getByRole('tab', { name: 'AI Configuration' }).click()
    await page.waitForTimeout(300)

    const testButton = page.getByRole('button', { name: /test (new|saved) key/i })
    const saveButton = page.getByRole('button', { name: /save key/i })
    const apiKeyInput = page.getByLabel(/api key/i)
    const savedState = page.getByTestId('byok-saved-state')

    await expect(testButton).toBeEnabled()
    await expect(saveButton).toBeDisabled()
    await expect(savedState).toBeVisible()

    await apiKeyInput.fill('sk-test-123456789')

    await expect(page.getByRole('button', { name: /test new key/i })).toBeEnabled()
    await expect(saveButton).toBeEnabled()
  })

  test('Settings BYOK test/save use backend response (not route unavailable)', async ({ page }) => {
    // Seed a key so test starts from a known state
    await page.goto('/settings')
    await seedByokKey(page)
    await page.reload()
    // Navigate to AI Configuration tab where BYOK settings live
    await page.getByRole('tab', { name: 'AI Configuration' }).click()
    await page.waitForTimeout(300)

    const apiKeyInput = page.getByLabel(/api key/i)
    const testButton = page.getByTestId('byok-test')
    const saveButton = page.getByTestId('byok-save')
    const actionStatus = page.getByTestId('byok-action-status')

    await apiKeyInput.fill('sk-test-123456789')

    await testButton.click()
    await expect(actionStatus).toBeVisible({ timeout: 15_000 })
    await expect(actionStatus).not.toContainText(/route is unavailable/i)

    await saveButton.click()
    await expect(actionStatus).toBeVisible({ timeout: 15_000 })
    await expect(actionStatus).not.toContainText(/route is unavailable/i)
  })
})
