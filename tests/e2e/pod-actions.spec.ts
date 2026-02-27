import { test, expect, type Locator, type Page } from '@playwright/test'
import { login } from './helpers'

/** Escape special regex characters in a string for safe use in `new RegExp()` */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function openFirstClusterDetails(page: Page) {
  await page.goto('/clusters')

  const table = page.locator('table').first()
  await expect(table).toBeVisible({ timeout: 10_000 })

  const firstRow = table.locator('tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 10_000 })
  // Wait for actual data to load (not skeleton rows) before clicking
  await expect(firstRow).toContainText(/.+/, { timeout: 10_000 })

  // Find the first cell with text to click (some tables have empty checkbox columns)
  const cells = firstRow.locator('td')
  const cellCount = await cells.count()
  let nameCell = cells.first()
  for (let i = 0; i < cellCount; i++) {
    const text = await cells.nth(i).innerText({ timeout: 2_000 }).catch(() => '')
    if (text.trim()) { nameCell = cells.nth(i); break }
  }
  await nameCell.click()

  await expect(page).toHaveURL(/\/clusters\/.+/, { timeout: 15_000 })
  // Wait for detail page to finish loading
  await expect(page.getByText(/loading cluster details/i)).toBeHidden({ timeout: 20_000 }).catch(() => {
    // Text may not appear if page loads fast — that's fine
  })
}

/**
 * Try to find a pods table with actual pod data on the cluster detail page.
 * Returns null if no live pods are available (test should skip).
 */
async function tryGetFirstPodRow(page: Page): Promise<Locator | null> {
  // The cluster detail page shows pods only when live K8s data is available
  const podsHeading = page.getByRole('heading', { name: /pods/i }).first()
  const headingVisible = await podsHeading.isVisible({ timeout: 5_000 }).catch(() => false)
  if (!headingVisible) return null

  // Look for any table on the page that has pod-like data
  const tables = page.locator('table')
  const tableCount = await tables.count()
  for (let i = 0; i < tableCount; i++) {
    const rows = tables.nth(i).locator('tbody tr')
    const rowCount = await rows.count().catch(() => 0)
    if (rowCount > 0) {
      const firstRow = rows.first()
      const hasDelete = await firstRow.locator('button[title^="Delete pod"]').count().catch(() => 0)
      if (hasDelete > 0) return firstRow
    }
  }
  return null
}

async function openDeletePodDialogFromFirstPod(page: Page) {
  await openFirstClusterDetails(page)

  const firstPodRow = await tryGetFirstPodRow(page)
  if (!firstPodRow) {
    test.skip(true, 'No live pods available — cluster may lack K8s connection')
    return { dialog: null as unknown as Locator, podName: '', podNamespace: '' }
  }

  const cells = firstPodRow.locator('td')
  const podName = (await cells.nth(0).innerText({ timeout: 10_000 })).trim()
  const podNamespace = (await cells.nth(1).innerText({ timeout: 10_000 })).trim()

  const deleteButton = firstPodRow.locator('button[title^="Delete pod"]').first()
  await expect(deleteButton).toBeVisible({ timeout: 10_000 })
  await deleteButton.click()

  const dialog = page.getByRole('dialog', { name: /delete pod/i })
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  return { dialog, podName, podNamespace }
}

async function openScaleDialogForFirstDeployment(page: Page) {
  await page.goto('/deployments')

  // Deployments page groups by cluster — wait for any deployment data to appear
  const heading = page.getByRole('heading', { name: /deployments/i }).first()
  await expect(heading).toBeVisible({ timeout: 10_000 })

  // Wait for table content — DataTable renders <table> elements per cluster group
  const table = page.locator('table').first()
  const tableVisible = await table.isVisible({ timeout: 10_000 }).catch(() => false)
  if (!tableVisible) {
    test.skip(true, 'No deployments table visible — clusters may lack K8s connection')
    return { dialog: null as unknown as Locator, deploymentName: '' }
  }

  const firstRow = table.locator('tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 10_000 })
  await expect(firstRow).toContainText(/.+/, { timeout: 10_000 })

  const deploymentName = (await firstRow.locator('td').nth(0).innerText({ timeout: 10_000 })).trim()

  const scaleButton = firstRow.getByTitle('Scale').or(firstRow.getByRole('button', { name: /scale/i })).first()
  await expect(scaleButton).toBeVisible({ timeout: 10_000 })
  await scaleButton.click()

  const dialog = page.getByRole('dialog', { name: /scale/i })
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  return { dialog, deploymentName }
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('Pod Delete — dialog opens from cluster detail page', async ({ page }) => {
  const { dialog, podName, podNamespace } = await openDeletePodDialogFromFirstPod(page)

  await expect(dialog).toContainText('Delete Pod')
  await expect(dialog).toContainText(podName)
  await expect(dialog).toContainText(podNamespace)

  await dialog.getByRole('button', { name: /^cancel$/i }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
})

test('Deployment Scale — dialog opens from deployments page', async ({ page }) => {
  const { dialog } = await openScaleDialogForFirstDeployment(page)

  await expect(dialog.getByRole('heading', { name: /scale deployment/i })).toBeVisible({ timeout: 10_000 })
  await expect(dialog.getByLabel(/replicas/i)).toBeVisible({ timeout: 10_000 })

  await dialog.getByRole('button', { name: /^cancel$/i }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
})

// NOTE: destructive tests modify real K8s state.
test.describe('destructive', () => {
  test('Pod Delete — actually deletes a pod', async ({ page }) => {
    const { dialog, podName } = await openDeletePodDialogFromFirstPod(page)

    await dialog.getByRole('button', { name: /^delete$/i }).click()

    // Verify success toast appears (pod may be recreated by K8s controller quickly)
    await expect(page.getByText(new RegExp(`Pod\\s+${escapeRegex(podName)}\\s+deleted`, 'i'))).toBeVisible({ timeout: 10_000 })

    // Dialog should close after successful deletion
    await expect(dialog).toBeHidden({ timeout: 10_000 })
  })

  test('Deployment Scale — changes replica count', async ({ page }) => {
    const { dialog, deploymentName } = await openScaleDialogForFirstDeployment(page)

    const replicasInput = dialog.getByLabel(/replicas/i)
    await expect(replicasInput).toBeVisible({ timeout: 10_000 })

    const currentValue = Number(await replicasInput.inputValue())
    const nextValue = currentValue >= 50 ? Math.max(0, currentValue - 1) : currentValue + 1

    await replicasInput.fill(String(nextValue))
    await dialog.getByRole('button', { name: /^apply$/i }).click()

    await expect(page.getByText(new RegExp(`Scaled\\s+${escapeRegex(deploymentName)}`, 'i'))).toBeVisible({ timeout: 10_000 })
  })
})
