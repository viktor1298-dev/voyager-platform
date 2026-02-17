import { expect, test, type Page } from '@playwright/test';
import { login } from '../e2e/helpers';
import { stabilizeVisuals } from './stabilize';

async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');
}

async function applyTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((mode) => {
    const root = document.documentElement;
    root.classList.remove('dark');
    if (mode === 'dark') root.classList.add('dark');
  }, theme);
}

async function captureRoute(
  page: Page,
  route: string,
  name: string,
  theme: 'light' | 'dark',
): Promise<void> {
  await page.goto(route);
  await waitForPageReady(page);
  await applyTheme(page, theme);

  const mask = await stabilizeVisuals(page);
  await expect(page).toHaveScreenshot(`${name}-${theme}.png`, { mask });
}

test.describe('Visual regression — main pages', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard (light + dark)', async ({ page }) => {
    await captureRoute(page, '/dashboard', 'dashboard', 'light');
    await captureRoute(page, '/dashboard', 'dashboard', 'dark');
  });

  test('clusters (light + dark)', async ({ page }) => {
    await captureRoute(page, '/clusters', 'clusters', 'light');
    await captureRoute(page, '/clusters', 'clusters', 'dark');
  });

  test('deployments (light + dark)', async ({ page }) => {
    await captureRoute(page, '/deployments', 'deployments', 'light');
    await captureRoute(page, '/deployments', 'deployments', 'dark');
  });

  test('events (light + dark)', async ({ page }) => {
    await captureRoute(page, '/events', 'events', 'light');
    await captureRoute(page, '/events', 'events', 'dark');
  });
});
