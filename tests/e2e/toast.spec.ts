import { test, expect } from '@playwright/test';

test.describe('Toast Notifications', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('failed login shows error toast', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.keyboard.press('Enter');

    // Sonner renders toasts in [data-sonner-toaster] or as ol > li
    const toast = page.locator('[data-sonner-toast], [role="status"]').first();
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Toast should contain error-related text
    const toastText = await toast.textContent();
    expect(toastText?.toLowerCase()).toMatch(/error|invalid|failed|incorrect/);
  });

  test('toast auto-dismisses after timeout', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.keyboard.press('Enter');

    const toast = page.locator('[data-sonner-toast], [role="status"]').first();
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Wait for auto-dismiss (Sonner default is ~4s)
    await expect(toast).not.toBeVisible({ timeout: 10_000 });
  });
});
