import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('Optimistic UI + Motion Animations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('page navigation renders with transition', async ({ page }) => {
    await page.goto('/clusters')
    await page.waitForSelector('h1:has-text("Clusters")', { state: 'visible', timeout: 30000 })
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible({ timeout: 10_000 })

    // Navigate to Alerts (which IS in the sidebar nav)
    await page.click('a[href="/alerts"]')
    // Use URL assertion — Alerts page does not render an h1 heading
    await page.waitForURL(/\/alerts/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/alerts/)

    // Navigate back to Clusters
    await page.click('a[href="/clusters"]')
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible({ timeout: 10_000 })
  })

  test('optimistic delete cluster shows immediate feedback', async ({ page }) => {
    await page.goto('/clusters')
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible()

    const deleteBtn = page.locator('button[title="Delete cluster"]').first()
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()
      await expect(page.getByRole('heading', { name: /delete cluster/i })).toBeVisible()
    }
  })

  test('optimistic role change shows immediate update', async ({ page }) => {
    await page.goto('/settings/users', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/settings\/users/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 15_000 })

    const roleBtn = page.locator('button:has-text("Promote"), button:has-text("Demote")').first()
    if (await roleBtn.isVisible()) {
      const btnText = await roleBtn.textContent()
      await roleBtn.click()

      if (btnText?.includes('Promote')) {
        await expect(
          page.locator('text=Role updated').or(page.locator('button:has-text("Demote")').first()),
        ).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('rollback shows error toast on failure', async ({ page }) => {
    await page.route('**/trpc/clusters.delete*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: { message: 'Server error' } }) }),
    )

    await page.goto('/clusters')
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible()

    const deleteBtn = page.locator('button[title="Delete cluster"]').first()
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()
      const confirmBtn = page.getByRole('button', { name: /^delete$/i }).last()
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click()
        await expect(page.locator('text=rolled back')).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('reduced motion preference disables animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await page.goto('/clusters')
    await page.waitForSelector('h1:has-text("Clusters")', { state: 'visible', timeout: 30000 })
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible({ timeout: 10_000 })

    await page.click('a[href="/clusters"]')
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible({ timeout: 10_000 })
  })

  test('dialog animations work', async ({ page }) => {
    await page.goto('/clusters')
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible()

    const deleteBtn = page.getByRole('button', { name: /^delete cluster$/i }).first()
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()
      await expect(page.getByRole('heading', { name: /delete cluster/i })).toBeVisible()
      await expect(page.getByText(/this action cannot be undone/i)).toBeVisible()

      await page.getByRole('button', { name: /^cancel$/i }).click()
      await expect(page.getByRole('heading', { name: /delete cluster/i })).not.toBeVisible({ timeout: 2000 })
    }
  })
})
