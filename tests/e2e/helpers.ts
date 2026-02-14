import { type Page } from '@playwright/test';

export const TEST_USER = {
  email: 'admin@voyager.local',
  password: 'admin123',
} as const;

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_USER.email);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
  await page.waitForURL('**/', { timeout: 15_000 });
  // Wait for the page to fully load after redirect
  await page.waitForLoadState('networkidle', { timeout: 10_000 });
}
