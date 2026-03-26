import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@voyager.local');
  await page.getByLabel(/password/i).fill(process.env.E2E_ADMIN_PASSWORD ?? 'admin123');
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();

  // Wait for redirect away from login
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

  // Save auth state for all tests
  await page.context().storageState({ path: authFile });
});
