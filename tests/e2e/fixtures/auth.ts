import { test as base, Page } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

type AuthFixtures = { authenticatedPage: Page }

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageStatePath: authFile })
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
})

export { expect } from '@playwright/test'
