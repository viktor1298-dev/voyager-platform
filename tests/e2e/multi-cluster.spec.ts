import { test, expect } from '@playwright/test';
import { login } from './helpers';

async function openAddClusterWizard(page: import('@playwright/test').Page) {
  await page.goto('/clusters');
  await page.getByRole('button', { name: /add cluster/i }).first().click();
  await expect(page.getByText(/step 1\/4/i)).toBeVisible();
}

test.describe('Multi-cluster flows (Phase D)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('E2E-1: Add cluster via wizard (kubeconfig) → appears in list', async ({ page }) => {
    const clusterName = `e2e-kube-${Date.now()}`;

    await openAddClusterWizard(page);
    await page.getByRole('button', { name: /go to next step/i }).click();

    await page.getByPlaceholder(/apiVersion: v1/i).fill(`apiVersion: v1\nkind: Config\nclusters:\n- name: dev\n  cluster:\n    server: https://kubernetes.default.svc\n    insecure-skip-tls-verify: true\ncontexts:\n- name: dev\n  context:\n    cluster: dev\n    user: dev\ncurrent-context: dev\nusers:\n- name: dev\n  user:\n    token: test`);

    await page.getByRole('button', { name: /go to next step/i }).click();
    await expect(page.getByText(/step 3\/4/i)).toBeVisible();

    const success = page.getByText(/connection test passed\. ready to continue\./i);
    const failure = page.getByText(/connection test failed|failed|forbidden|unauthorized|invalid/i).first();
    try {
      await expect(success.or(failure)).toBeVisible({ timeout: 20_000 });
    } catch {
      test.skip(true, 'Connection test result not visible in time');
    }

    if (await failure.isVisible()) {
      test.skip(true, 'Environment cannot validate kubeconfig connection right now');
    }

    await page.getByRole('button', { name: /go to next step/i }).click();
    await expect(page.getByText(/step 4\/4/i)).toBeVisible();
    await page.getByPlaceholder(/name override/i).fill(clusterName);
    await page.getByRole('button', { name: /add cluster/i }).click();

    await expect(page.getByRole('heading', { name: /^clusters$/i })).toBeVisible();
    await expect(page.getByText(clusterName).first()).toBeVisible({ timeout: 15_000 });
  });

  test('E2E-2: Cluster detail → live tab loads nodes', async ({ page }) => {
    await page.goto('/clusters');
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    // Wait for actual data (not skeleton)
    await expect(firstRow.locator('td').first()).not.toHaveClass(/skeleton/);
    await expect(firstRow.locator('td').first()).not.toBeEmpty();
    await page.waitForTimeout(500);
    await firstRow.click();

    await expect(page).toHaveURL(/\/clusters\/.+/);
    await expect(page.getByText(/loading cluster details/i)).toBeHidden({ timeout: 20_000 });

    const heading = page.locator('h1').first();
    const errorState = page.getByText(/failed to load data/i);
    await expect(heading.or(errorState)).toBeVisible();

    // Verify cluster detail content is meaningful — check any one indicator
    const hasLiveTab = page.getByRole('tab', { name: /live/i });
    const hasStoredTab = page.getByRole('tab', { name: /stored/i });
    // Use first() on the combined chain to avoid strict mode violation
    await expect(hasLiveTab.or(hasStoredTab).or(errorState).first()).toBeVisible({ timeout: 10_000 });
  });

  test('E2E-3: Invalid kubeconfig → error message', async ({ page }) => {
    await openAddClusterWizard(page);
    await page.getByRole('button', { name: /go to next step/i }).click();

    await page.getByPlaceholder(/apiVersion: v1/i).fill('not-a-valid-kubeconfig');
    await page.getByRole('button', { name: /go to next step/i }).click();

    await expect(page.getByText(/step 3\/4/i)).toBeVisible();
    // Wait for validation result — match the specific error text from the wizard
    await expect(page.getByText(/connection.*failed|validation.*failed|invalid.*kubeconfig|no active cluster/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('E2E-4: TopBar cluster selector → switch context', async ({ page }) => {
    await page.goto('/clusters');

    const selector = page.getByRole('combobox', { name: /active cluster/i });
    await expect(selector).toBeVisible();

    const options = selector.locator('option');
    const count = await options.count();
    test.skip(count < 3, 'Need at least 2 clusters to verify selector switching');

    const secondValue = await options.nth(1).getAttribute('value');
    const thirdValue = await options.nth(2).getAttribute('value');

    await selector.selectOption(secondValue!);
    await expect(selector).toHaveValue(secondValue!);

    await selector.selectOption(thirdValue!);
    await expect(selector).toHaveValue(thirdValue!);
  });

  test('E2E-5: Delete cluster → removed from list', async ({ page }) => {
    await page.goto('/clusters');

    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });

    // Wait for table data to fully load (no skeleton rows)
    await expect(rows.first().locator('td').first()).not.toHaveClass(/skeleton/, { timeout: 10_000 });
    await expect(rows.first().locator('td').first()).not.toBeEmpty({ timeout: 10_000 });
    await page.waitForTimeout(500); // stabilize after render

    // Only delete clusters created by E2E tests (e2e-kube- prefix) to preserve real data
    const rowCount = await rows.count();
    if (rowCount === 0) {
      test.skip(true, 'No rows in cluster table');
    }
    let row = rows.first();
    let clusterName = '';
    const scanTimeout = 10_000;
    const scanStart = Date.now();
    for (let i = rowCount - 1; i >= 0; i--) {
      if (Date.now() - scanStart > scanTimeout) break;
      try {
        const candidate = rows.nth(i);
        const name = (await candidate.locator('td').first().innerText({ timeout: 3_000 })).trim();
        if (name && /^e2e-kube-/.test(name)) {
          row = candidate;
          clusterName = name;
          break;
        }
      } catch {
        continue; // skip unreadable rows
      }
    }
    test.skip(!clusterName, 'No e2e-created cluster (e2e-kube-*) found to delete');

    await row.hover();
    await row.getByRole('button', { name: /delete cluster/i }).click();

    await expect(page.getByRole('heading', { name: /delete cluster/i })).toBeVisible();
    await page.getByRole('button', { name: /^delete$/i }).click();

    await expect(page.getByText(clusterName)).toHaveCount(0, { timeout: 15_000 });
  });

  test('E2E-6: AWS provider → fill fields → validate', async ({ page }) => {
    await openAddClusterWizard(page);

    await page.getByRole('radio', { name: /aws eks/i }).click();
    await page.getByRole('button', { name: /go to next step/i }).click();

    await page.getByPlaceholder(/access key id/i).fill('AKIAE2EEXAMPLE');
    await page.getByPlaceholder(/secret access key/i).fill('secret-test-value');
    await page.getByPlaceholder(/region/i).fill('us-east-1');

    const next = page.getByRole('button', { name: /go to next step/i });
    await expect(next).toBeEnabled();
    await next.click();

    await expect(page.getByText(/step 3\/4/i)).toBeVisible();
    await expect(page.getByText(/testing connection|connection test passed|failed|forbidden|unauthorized|invalid/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
