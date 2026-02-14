import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Theme — Dark/Light/System Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should toggle theme and update html/body class', async ({ page }) => {
    const html = page.locator('html');

    // Find theme toggle — try multiple selectors
    const themeToggle = page.locator('[data-testid="theme-toggle"]')
      .or(page.getByRole('button', { name: /switch to (light|dark) mode/i }))
      .or(page.locator('button:has(svg)').filter({ hasText: '' }).nth(0));
    
    // The toggle might be in the TopBar — need to find it
    const toggleBtn = page.getByLabel(/switch to (light|dark) mode/i);
    const hasAriaLabel = await toggleBtn.count() > 0;
    
    const btn = hasAriaLabel ? toggleBtn : themeToggle;
    await expect(btn.first()).toBeVisible({ timeout: 5000 });

    // Get initial state
    const initialClass = await html.getAttribute('class') ?? '';
    const wasDark = initialClass.includes('dark');

    // Click to toggle
    await btn.first().click();
    await page.waitForTimeout(500);

    // Verify theme changed
    const afterClass = await html.getAttribute('class') ?? '';
    if (wasDark) {
      // Should now be light (no 'dark' in class, or class changed)
      expect(afterClass).not.toEqual(initialClass);
    } else {
      expect(afterClass).toContain('dark');
    }

    // Toggle back
    await btn.first().click();
    await page.waitForTimeout(500);

    const finalClass = await html.getAttribute('class') ?? '';
    // Should be back to initial state
    if (wasDark) {
      expect(finalClass).toContain('dark');
    }
  });

  test('System theme option follows prefers-color-scheme', async ({ page }) => {
    // Look for a theme dropdown/select with System option
    const themeDropdown = page.locator('[data-testid="theme-dropdown"]')
      .or(page.getByRole('button', { name: /theme/i }))
      .first();

    const hasDropdown = await themeDropdown.isVisible().catch(() => false);
    if (!hasDropdown) {
      test.skip();
      return;
    }

    await themeDropdown.click();

    // Select "System" option
    const systemOption = page.getByRole('menuitem', { name: /system/i })
      .or(page.getByRole('option', { name: /system/i }))
      .or(page.locator('[data-testid="theme-system"]'))
      .first();

    const hasSystem = await systemOption.isVisible().catch(() => false);
    if (!hasSystem) {
      test.skip();
      return;
    }

    await systemOption.click();
    await page.waitForTimeout(500);

    // Emulate dark mode preference
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(500);

    const html = page.locator('html');
    const darkClass = await html.getAttribute('class') ?? '';
    expect(darkClass).toContain('dark');

    // Switch to light preference
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(500);

    const lightClass = await html.getAttribute('class') ?? '';
    expect(lightClass).not.toContain('dark');
  });
});
