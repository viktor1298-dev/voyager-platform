import { test, expect } from '@playwright/test';
import { TEST_ADMIN, AUTH_COOKIE_NAME, login } from './helpers';

test.describe('Authentication', () => {
  test('should login with valid credentials and redirect to dashboard', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL('/');
    await expect(page.locator('body')).not.toContainText(/login/i);
  });

  test('should set better-auth session cookie after login', async ({ page, context }) => {
    await login(page);
    const cookies = await context.cookies();
    const authCookie = cookies.find((c) => c.name === AUTH_COOKIE_NAME);
    expect(authCookie).toBeTruthy();
    expect(authCookie!.httpOnly).toBe(true);
  });

  test('should show error with wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    await expect(page.locator('[role="alert"], .error, [data-testid="error"]')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('should show validation on empty fields', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    // Either HTML5 validation or custom error messages
    const invalidInputs = page.locator('input:invalid');
    const errorMessages = page.locator('[role="alert"], .error, [data-testid="error"]');
    const hasValidation =
      (await invalidInputs.count()) > 0 || (await errorMessages.count()) > 0;
    expect(hasValidation).toBe(true);
  });
});
