import { test, expect } from '@playwright/test';
import { login } from './helpers';

const BASE_URL = process.env.BASE_URL ?? 'http://voyager-platform.voyagerlabs.co';

test.describe('Theme — Dark/Light/System Toggle (Dropdown)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should switch theme via dropdown option', async ({ page }) => {
    const html = page.locator('html');
    const btn = page.locator('[data-testid="theme-toggle"]').first();

    await expect(btn).toBeVisible({ timeout: 5000 });

    // Open dropdown
    await btn.click();

    // Dropdown should appear with listbox role
    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible({ timeout: 3000 });

    // Get current theme class
    const classBefore = (await html.getAttribute('class')) ?? '';
    const isDarkBefore = classBefore.includes('dark');

    // Click the opposite theme: if dark, pick Light; if light, pick Dark
    const targetLabel = isDarkBefore ? 'Light' : 'Dark';
    const option = listbox.locator('button', { hasText: targetLabel });
    await option.click();

    // Dropdown should close
    await expect(listbox).not.toBeVisible({ timeout: 2000 });

    // Verify the <html> class changed
    if (isDarkBefore) {
      await expect(html).not.toHaveClass(/dark/, { timeout: 3000 });
    } else {
      await expect(html).toHaveClass(/dark/, { timeout: 3000 });
    }
  });

  test('System theme option follows prefers-color-scheme', async ({ page }) => {
    const html = page.locator('html');
    const btn = page.locator('[data-testid="theme-toggle"]').first();
    await expect(btn).toBeVisible({ timeout: 5000 });

    // Open dropdown and select "System"
    await btn.click();
    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible({ timeout: 3000 });

    const systemOption = listbox.locator('button', { hasText: 'System' });
    await systemOption.click();
    await expect(listbox).not.toBeVisible({ timeout: 2000 });

    // Verify system theme is now active (button title should mention system)
    await expect(btn).toHaveAttribute('title', /System/, { timeout: 3000 });

    // Emulate dark color scheme → html should have "dark" class
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect
      .poll(async () => ((await html.getAttribute('class')) ?? '').includes('dark'), {
        timeout: 5000,
      })
      .toBeTruthy();

    // Emulate light color scheme → html should NOT have "dark" class
    await page.emulateMedia({ colorScheme: 'light' });
    await expect
      .poll(async () => !((await html.getAttribute('class')) ?? '').includes('dark'), {
        timeout: 5000,
      })
      .toBeTruthy();
  });
});
