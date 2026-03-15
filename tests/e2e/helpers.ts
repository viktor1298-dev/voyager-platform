import { type Page, expect } from '@playwright/test';

/**
 * Wait for page to be interactive — replaces networkidle.
 * Use when you need a generic page-load wait without a specific element to target.
 * Prefer waiting for a specific selector/heading when possible.
 */
export async function waitForPageReady(page: Page, options?: { timeout?: number }) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('load');
  // Small buffer for React hydration
  await page.waitForTimeout(100);
}

export const TEST_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@voyager.local',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
};

export const TEST_VIEWER = {
  email: process.env.E2E_VIEWER_EMAIL ?? 'viewer@voyager.local',
  password: process.env.E2E_VIEWER_PASSWORD ?? 'viewer123',
};

/** @deprecated Use TEST_ADMIN instead */
export const TEST_USER = TEST_ADMIN;

export const AUTH_COOKIE_NAME = 'better-auth.session_token';

export async function login(page: Page, user = TEST_ADMIN): Promise<void> {
  // Clear cookies to ensure clean login state (prevents auto-redirect from /login)
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();

  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

  // networkidle is flaky in this app because post-login dashboard bootstrapping
  // may keep long-polling/live requests open. Wait for an authenticated shell signal instead.
  await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 20_000 });
}

export async function loginAsViewer(page: Page): Promise<void> {
  await login(page, TEST_VIEWER);
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, TEST_ADMIN);
}

export async function ensureViewerExists(): Promise<void> {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) throw new Error('BASE_URL is required for E2E tests');
  const headers = {
    'Content-Type': 'application/json',
    Origin: baseUrl,
  };

  const signIn = async () =>
    fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: TEST_VIEWER.email,
        password: TEST_VIEWER.password,
      }),
    });

  try {
    const existing = await signIn();
    if (existing.ok) return;

    await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: TEST_VIEWER.email,
        password: TEST_VIEWER.password,
        name: 'Viewer User',
      }),
    });

    const created = await signIn();
    if (!created.ok) {
      throw new Error(`viewer sign-in still failing after ensure: ${created.status}`);
    }
  } catch (error) {
    throw new Error(`ensureViewerExists failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
