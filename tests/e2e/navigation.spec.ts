import { test, expect } from '@playwright/test';
import { login } from './helpers';

const PAGES = [
  { path: '/', name: 'Dashboard', heading: /dashboard/i },
  { path: '/clusters', name: 'Clusters', heading: /cluster/i },
  { path: '/deployments', name: 'Deployments', heading: /deployment/i },
  { path: '/events', name: 'Events', heading: /event/i },
  { path: '/settings', name: 'Settings', heading: /setting/i },
] as const;

test.describe('Navigation — All Pages Load', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const { path, name, heading } of PAGES) {
    test(`${name} page (${path}) loads without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');

      // Verify heading or key content exists
      const headingEl = page.getByRole('heading', { name: heading });
      const fallback = page.locator(`h1, h2, [data-testid="${name.toLowerCase()}"]`);
      const hasContent = (await headingEl.count()) > 0 || (await fallback.count()) > 0;
      expect(hasContent).toBe(true);

      // No JS errors
      expect(errors).toHaveLength(0);
    });
  }
});
