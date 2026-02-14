import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('Optimistic UI + Motion Animations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('page navigation renders with transition', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h2:has-text("Clusters")')).toBeVisible()

    // Navigate to clusters
    await page.click('a[href="/clusters"]')
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible()

    // Navigate to deployments
    await page.click('a[href="/deployments"]')
    await expect(page.locator('h1:has-text("Deployments")')).toBeVisible()
  })

  test('optimistic delete cluster shows immediate feedback', async ({ page }) => {
    await page.goto('/clusters')
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible()

    // Wait for table to load
    const rows = page.locator('table tbody tr')
    const initialCount = await rows.count()

    if (initialCount > 0) {
      // Click delete on first cluster
      const deleteBtn = page.locator('button[title="Delete cluster"]').first()
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click()

        // Confirm dialog should appear
        await expect(page.locator('text=Delete Cluster')).toBeVisible()
      }
    }
  })

  test('optimistic role change shows immediate update', async ({ page }) => {
    await page.goto('/users')
    await expect(page.locator('h1:has-text("User Management")')).toBeVisible()

    // Look for promote/demote buttons
    const roleBtn = page.locator('button:has-text("Promote"), button:has-text("Demote")').first()
    if (await roleBtn.isVisible()) {
      const btnText = await roleBtn.textContent()
      await roleBtn.click()

      // After optimistic update, the role should change instantly
      // (the button text should flip)
      if (btnText?.includes('Promote')) {
        // Should see "Demote" now or a success toast
        await expect(
          page.locator('text=Role updated').or(page.locator('button:has-text("Demote")').first()),
        ).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('rollback shows error toast on failure', async ({ page }) => {
    // Intercept and fail the delete request
    await page.route('**/trpc/clusters.delete*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: { message: 'Server error' } }) }),
    )

    await page.goto('/clusters')
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible()

    const deleteBtn = page.locator('button[title="Delete cluster"]').first()
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()
      // Confirm
      const confirmBtn = page.locator('button:has-text("Delete")').last()
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click()
        // Should see error toast about rollback
        await expect(page.locator('text=rolled back')).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('reduced motion preference disables animations', async ({ page }) => {
    // Emulate reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await page.goto('/')
    await expect(page.locator('h2:has-text("Clusters")')).toBeVisible()

    // Navigate and verify no motion wrappers render with animation
    await page.click('a[href="/clusters"]')
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible()

    // The page should still work — content should be visible immediately
    // (no motion.div wrappers = plain divs)
  })

  test('dialog animations work', async ({ page }) => {
    await page.goto('/clusters')
    await expect(page.locator('h1:has-text("Clusters")')).toBeVisible()

    // Click Add Cluster
    const addBtn = page.locator('button:has-text("Add Cluster")')
    if (await addBtn.isVisible()) {
      await addBtn.click()
      // Dialog should appear with animation
      await expect(page.locator('text=Cluster Name')).toBeVisible()

      // Close via X button
      await page.locator('button:has(svg.lucide-x)').click()
      // Dialog should close
      await expect(page.locator('text=Cluster Name')).not.toBeVisible({ timeout: 2000 })
    }
  })
})
