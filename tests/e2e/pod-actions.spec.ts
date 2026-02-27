import { test, expect, type Locator, type Page } from '@playwright/test'
import { login } from './helpers'

async function openFirstClusterDetails(page: Page) {
  await page.goto('/clusters')

  const table = page.locator('table').first()
  await expect(table).toBeVisible({ timeout: 10_000 })

  const firstRow = table.locator('tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 10_000 })
  await firstRow.click()

  await expect(page).toHaveURL(/\/clusters\/.+/, { timeout: 10_000 })
  // Wait for detail page to finish loading — wait for any heading or stat card to appear
  await expect(page.locator('h1, h2, [data-testid="cluster-header"]').first()).toBeVisible({ timeout: 15_000 })
}

async function getFirstPodRow(page: Page): Promise<Locator> {
  // Find the pods section by heading, then locate the nearest table
  const podsHeading = page.getByRole('heading', { name: /pods/i }).first()
  await expect(podsHeading).toBeVisible({ timeout: 10_000 })

  // Get any table that follows the pods heading (sibling or descendant)
  const podsSection = podsHeading.locator('..').locator('table').first()
  // Fallback: if no sibling table, try page-level tables after the heading
  const podsTable = (await podsSection.count()) > 0
    ? podsSection
    : page.locator('table').last()
  const firstPodRow = podsTable.locator('tbody tr').first()
  await expect(firstPodRow).toBeVisible({ timeout: 10_000 })
  return firstPodRow
}

async function openDeletePodDialogFromFirstPod(page: Page) {
  await openFirstClusterDetails(page)

  const firstPodRow = await getFirstPodRow(page)
  const cells = firstPodRow.locator('td')

  const podName = (await cells.nth(0).innerText({ timeout: 10_000 })).trim()
  const podNamespace = (await cells.nth(1).innerText({ timeout: 10_000 })).trim()

  const deleteButton = firstPodRow.locator('button[title^="Delete pod"], button:has-text("Delete Pod")').first()
  await expect(deleteButton).toBeVisible({ timeout: 10_000 })
  await deleteButton.click()

  const dialog = page.locator('[role="dialog"][aria-label*="Delete pod"]')
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  return { dialog, podName, podNamespace }
}

async function openScaleDialogForFirstDeployment(page: Page) {
  await page.goto('/deployments')
  await expect(page.getByRole('heading', { name: /deployments/i })).toBeVisible({ timeout: 10_000 })

  const table = page.locator('table').first()
  await expect(table).toBeVisible({ timeout: 10_000 })

  const firstRow = table.locator('tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 10_000 })

  const deploymentName = (await firstRow.locator('td').nth(0).innerText({ timeout: 10_000 })).trim()

  const scaleButton = firstRow.locator('button[aria-label*="Scale" i], button[title="Scale"], button:has-text("Scale")').first()
  await expect(scaleButton).toBeVisible({ timeout: 10_000 })
  await scaleButton.click()

  const dialog = page.locator('[role="dialog"][aria-label*="Scale "]')
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

// NOTE: destructive tests modify real K8s state.
test.describe('destructive', () => {
  test('Pod Delete — actually deletes a pod', async ({ page }) => {
    const { dialog, podName } = await openDeletePodDialogFromFirstPod(page)

    await dialog.getByRole('button', { name: /^delete$/i }).click()

    // Verify success toast appears (pod may be recreated by K8s controller quickly)
    await expect(page.getByText(new RegExp(`Pod\\s+${podName}\\s+deleted`, 'i'))).toBeVisible({ timeout: 10_000 })

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

    await expect(page.getByText(new RegExp(`Scaled\\s+${deploymentName}`, 'i'))).toBeVisible({ timeout: 10_000 })
  })
})

test('Deployment Scale — dialog opens from deployments page', async ({ page }) => {
  const { dialog } = await openScaleDialogForFirstDeployment(page)

  await expect(dialog.getByRole('heading', { name: /scale deployment/i })).toBeVisible({ timeout: 10_000 })
  await expect(dialog.getByLabel(/replicas/i)).toBeVisible({ timeout: 10_000 })

  await dialog.getByRole('button', { name: /^cancel$/i }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
})
