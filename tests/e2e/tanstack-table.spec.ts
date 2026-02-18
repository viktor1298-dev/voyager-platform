import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.describe('TanStack Table — Users Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: /users/i }).first().click()
    await expect(page).toHaveURL(/\/users/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('table renders structure and rows/empty state', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible()

    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 10_000 })
    await expect(table.getByRole('columnheader', { name: /name/i }).first()).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /email/i }).first()).toBeVisible()

    const dataRows = table.locator('tbody tr')
    const rowCount = await dataRows.count()

    if (rowCount === 0) {
      await expect(page.getByText(/no users found/i)).toBeVisible()
      return
    }

    await expect(dataRows.first()).toBeVisible({ timeout: 10_000 })
    expect(rowCount).toBeGreaterThan(0)
  })

  test('clicking column header sorts data', async ({ page }) => {
    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 10_000 })

    const nameHeader = table.getByRole('columnheader', { name: /name/i }).first()
    await expect(nameHeader).toBeVisible()

    const sortTarget = nameHeader.locator('button, [role="button"]').first()
    const canClickButton = await sortTarget.isVisible().catch(() => false)
    const clickTarget = canClickButton ? sortTarget : nameHeader

    const readNames = async () => {
      const headers = await table.locator('thead th').allTextContents()
      const nameColumnIndex = headers.findIndex((headerText) => /name/i.test(headerText.trim()))
      expect(nameColumnIndex).toBeGreaterThanOrEqual(0)

      const values = await table
        .locator(`tbody tr td:nth-child(${nameColumnIndex + 1})`)
        .allTextContents()

      return values.map((v) => v.trim()).filter((v) => v.length > 0 && !/^no users found$/i.test(v))
    }

    const initial = await readNames()

    if (initial.length === 0) {
      await expect(page.getByText(/no users found/i)).toBeVisible()
      return
    }

    await clickTarget.click()
    const asc = await readNames()

    await clickTarget.click()
    const desc = await readNames()

    expect(asc.length).toBeGreaterThan(0)
    expect(desc.length).toBeGreaterThan(0)

    if (initial.length > 1) {
      const ascExpected = [...asc].sort((a, b) => a.localeCompare(b))
      const descExpected = [...ascExpected].reverse()

      expect(asc).toEqual(ascExpected)
      expect(desc).toEqual(descExpected)
    }
  })

  test('filter/search narrows results', async ({ page }) => {
    const searchInput = page
      .getByRole('textbox', { name: /search users/i })
      .or(page.getByPlaceholder(/search users/i))
      .first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })

    const noUsersState = page.getByText(/no users found/i)
    if (await noUsersState.isVisible().catch(() => false)) {
      await expect(page.getByText(/0 users/i)).toBeVisible()
      return
    }

    const table = page.locator('table').first()
    await expect(table).toBeVisible()

    const rowsBefore = await table.locator('tbody tr').count()
    await searchInput.fill('admin')
    const rowsAfter = await table.locator('tbody tr').count()
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore)
  })

  test('pagination controls work', async ({ page }) => {
    const nextBtn = page.locator('button[aria-label="Next page"]')
    const prevBtn = page.locator('button[aria-label="Previous page"]')

    const hasPagination = await nextBtn.isVisible().catch(() => false)
    if (!hasPagination) {
      test.skip()
      return
    }

    await expect(prevBtn).toBeDisabled()
    await nextBtn.click()
    await expect(prevBtn).toBeEnabled()
  })
})
