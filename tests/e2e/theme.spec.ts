import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Theme — Dark/Light/System Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should toggle theme via theme button', async ({ page }) => {
    const html = page.locator('html');
    const btn = page.locator('[data-testid="theme-toggle"]').first();

    await expect(btn).toBeVisible({ timeout: 5000 });

    const labelBefore = (await btn.getAttribute('aria-label')) ?? '';
    const classBefore = (await html.getAttribute('class')) ?? '';

    await btn.click();

    const labelAfter = (await btn.getAttribute('aria-label')) ?? '';
    const classAfter = (await html.getAttribute('class')) ?? '';

    expect(labelAfter).not.toEqual(labelBefore);
    // class may not always change when cycling through system, but one of label/class should
    expect(labelAfter !== labelBefore || classAfter !== classBefore).toBeTruthy();
  });

  test('System theme option follows prefers-color-scheme', async ({ page }) => {
    const html = page.locator('html');
    const btn = page.locator('[data-testid="theme-toggle"]').first();
    await expect(btn).toBeVisible({ timeout: 5000 });

    const isSystemActive = async () => {
      const label = (await btn.getAttribute('aria-label')) ?? '';
      const title = (await btn.getAttribute('title')) ?? '';
      return /active:\s*system/i.test(title) || /current theme:\s*system/i.test(label);
    };

    for (let i = 0; i < 4; i++) {
      if (await isSystemActive()) break;
      await btn.click();
    }

    expect(await isSystemActive()).toBeTruthy();

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(async () => ((await html.getAttribute('class')) ?? '').includes('dark')).toBeTruthy();

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(async () => ((await html.getAttribute('class')) ?? '').includes('dark')).toBeFalsy();
  });
});
