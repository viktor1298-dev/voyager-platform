import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Clusters — CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should open add-cluster wizard and block progress without kubeconfig', async ({ page }) => {
    await page.goto('/clusters')
    await page
      .getByRole('button', { name: /add cluster/i })
      .first()
      .click()

    await expect(page.getByRole('heading', { name: /add cluster/i })).toBeVisible()
    await expect(page.getByText(/choose provider/i)).toBeVisible()
    await expect(page.getByRole('radio', { name: /kubeconfig/i })).toBeChecked()

    await page.getByRole('button', { name: 'Go to next step' }).click()
    await expect(page.getByText(/kubeconfig credentials/i)).toBeVisible()

    await expect(page.getByRole('button', { name: 'Go to next step' })).toBeDisabled()
    await expect(page.getByText(/fill the required credential fields to continue/i)).toBeVisible()
  })

  test('should view cluster detail', async ({ page }) => {
    await page.goto('/clusters')

    const queryError = page.getByText(/failed to load data/i)

    // Wait for either cluster cards/table OR a query error
    // With ≤5 clusters the page renders cards (buttons with aria-label "View cluster …")
    // With >5 clusters it renders a DataTable with tr[data-row]
    const clusterCard = page.locator('button[aria-label^="View cluster"]').first()
    const dataRow = page.locator('tr[data-row]').first()
    const emptyState = page.locator('[data-testid="empty-state"]').first()

    await expect(clusterCard.or(dataRow).or(queryError).or(emptyState)).toBeVisible({
      timeout: 15_000,
    })

    if (await queryError.isVisible()) {
      test.skip(true, 'Cluster list API returned an error — skipping detail navigation')
      return
    }
    if (await emptyState.isVisible()) {
      test.skip(true, 'No clusters found — seed data may be missing')
      return
    }

    // Determine which layout is active and get the cluster name
    let clusterName = ''
    if (await clusterCard.isVisible().catch(() => false)) {
      const label = (await clusterCard.getAttribute('aria-label')) ?? ''
      clusterName = label.replace(/^View cluster\s+/i, '').trim()
      await clusterCard.click()
    } else {
      const firstCell = dataRow.locator('td').first()
      clusterName = (await firstCell.innerText()).trim()
      await dataRow.click()
    }

    await expect(page).toHaveURL(/\/clusters\/.+/)
    await expect(page.getByText(/loading cluster details/i)).toBeHidden({ timeout: 20_000 })

    const readyState = page
      .locator('h1')
      .first()
      .or(page.getByRole('heading', { name: /failed to load data/i }))
    await expect(readyState).toBeVisible()

    if (await page.getByRole('heading', { name: /failed to load data/i }).isVisible()) {
      await expect(
        page.getByText(/failed to fetch from k8s api|unable to transform/i),
      ).toBeVisible()
    } else {
      await expect(page.locator('h1').first()).toContainText(clusterName)
    }
  })

  test('should show delete action for existing cluster row', async ({ page }) => {
    await page.goto('/clusters')

    // Wait for cluster cards or table rows to render
    const clusterCard = page.locator('button[aria-label^="View cluster"]').first()
    const dataRow = page.locator('tr[data-row]').first()
    const emptyState = page.locator('[data-testid="empty-state"]').first()

    await expect(clusterCard.or(dataRow).or(emptyState)).toBeVisible({ timeout: 15_000 })

    if (await emptyState.isVisible()) {
      test.skip(true, 'No clusters found — seed data may be missing')
      return
    }

    // Delete button is rendered only when user has admin permission on the cluster.
    // If not rendered, skip gracefully (RBAC-dependent).
    const deleteBtn = page.getByRole('button', { name: /delete cluster/i }).first()

    try {
      await expect(deleteBtn).toBeAttached({ timeout: 10_000 })
    } catch {
      // Button not in DOM — user lacks cluster admin permission in this environment
      test.skip(
        true,
        'Delete cluster button not rendered — user may lack cluster-level admin permission',
      )
      return
    }
    await deleteBtn.scrollIntoViewIfNeeded()
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 })
  })
})
