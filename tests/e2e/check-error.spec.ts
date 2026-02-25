import { test, expect } from '@playwright/test';

test('capture cluster detail errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGE_ERROR: ' + err.message));

  await page.goto('http://voyager-platform.voyagerlabs.co/login');
  await page.getByLabel(/email/i).fill('admin@voyager.local');
  await page.getByLabel(/password/i).fill('admin123');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL('**/*', { timeout: 10000 });
  await page.waitForTimeout(2000);

  await page.goto('http://voyager-platform.voyagerlabs.co/clusters/550e8400-e29b-41d4-a716-446655440000');
  await page.waitForTimeout(8000);

  console.log('=== CONSOLE ERRORS ===');
  for (const e of errors) console.log(e);
  console.log('=== END ERRORS ===');
  console.log('Total errors:', errors.length);
});
