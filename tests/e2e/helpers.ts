import { type Page } from '@playwright/test';

export const TEST_ADMIN = {
  email: 'admin@voyager.local',
  password: 'admin123',
} as const;

export const TEST_VIEWER = {
  email: 'viewer@voyager.local',
  password: 'viewer123',
} as const;

/** @deprecated Use TEST_ADMIN instead */
export const TEST_USER = TEST_ADMIN;

export const AUTH_COOKIE_NAME = 'better-auth.session_token';

export async function login(page: Page, user = TEST_ADMIN): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
  await page.waitForURL('**/', { timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 });
}

export async function loginAsViewer(page: Page): Promise<void> {
  await login(page, TEST_VIEWER);
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, TEST_ADMIN);
}

export async function ensureViewerExists(): Promise<void> {
  try {
    await fetch('http://localhost:9000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_VIEWER.email,
        password: TEST_VIEWER.password,
        name: 'Viewer User',
      }),
    });
  } catch {
    // User may already exist
  }
}
