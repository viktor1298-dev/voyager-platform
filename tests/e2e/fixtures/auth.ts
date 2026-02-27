import { test as base, Page } from '@playwright/test';

type AuthFixtures = { authenticatedPage: Page };

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.fill('[data-testid="login-email"]', process.env.TEST_USER ?? 'admin@voyager.local');
    await page.fill('[data-testid="login-password"]', process.env.TEST_PASS ?? 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await use(page);
  },
});

export { expect } from '@playwright/test';
