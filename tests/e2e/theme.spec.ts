import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Theme — Dark/Light Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should toggle theme and update html/body class', async ({ page }) => {
    const html = page.locator('html');
    const initialClass = await html.getAttribute('class') ?? '';
    const wasDark = initialClass.includes('dark');

    // Find and click theme toggle
    const themeToggle = page.getByRole('button', { name: /theme|dark|light|mode/i })
      .or(page.locator('[data-testid="theme-toggle"]'))
      .or(page.locator('button:has(svg[class*="moon"], svg[class*="sun"])'));
    await themeToggle.first().click();

    // Verify class changed
    if (wasDark) {
      await expect(html).not.toHaveClass(/dark/);
    } else {
      await expect(html).toHaveClass(/dark/);
    }

    // Toggle back
    await themeToggle.first().click();
    if (wasDark) {
      await expect(html).toHaveClass(/dark/);
    } else {
      await expect(html).not.toHaveClass(/dark/);
    }
  });
});
