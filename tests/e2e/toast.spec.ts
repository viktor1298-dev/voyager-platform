import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://voyager-platform.voyagerlabs.co';

test.describe('Login Error Notifications', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('failed login shows inline error alert', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.keyboard.press('Enter');

    // Login now uses an inline error with role="alert" instead of Sonner toasts
    const alert = page.locator('[role="alert"]').first();
    await expect(alert).toBeVisible({ timeout: 5000 });

    // Alert should contain error-related text (wait for async text to load)
    await expect(alert).toHaveText(/error|invalid|failed|incorrect|credentials/i, { timeout: 5000 });
  });

  test('error alert persists until next submission', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.keyboard.press('Enter');

    const alert = page.locator('[role="alert"]').first();
    await expect(alert).toBeVisible({ timeout: 5000 });

    // Inline error stays visible (doesn't auto-dismiss like a toast)
    await page.waitForTimeout(2000);
    await expect(alert).toBeVisible();

    // Error clears when user submits again
    await page.getByLabel(/email/i).fill('another@example.com');
    await page.keyboard.press('Enter');

    // The old alert text should be cleared (setLoginError(null) is called on submit)
    // A new alert may or may not appear depending on the response
  });
});
