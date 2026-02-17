import type { Locator, Page } from '@playwright/test';

export async function stabilizeVisuals(page: Page): Promise<Locator[]> {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });

  return [
    page.locator('time'),
    page.locator('[aria-live]'),
    page.locator('[data-testid*="time"], [data-testid*="timestamp"]'),
    page.locator('[data-testid*="counter"], [data-testid*="live"]'),
    page.locator('[class*="timestamp"], [class*="clock"], [class*="counter"], [class*="live"]'),
  ];
}
