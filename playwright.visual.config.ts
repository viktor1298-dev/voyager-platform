import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://voyager-platform.voyagerlabs.co',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      threshold: 0.1,
      fullPage: true,
      animations: 'disabled',
    },
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile',
      use: { viewport: { width: 375, height: 812 } },
    },
  ],
});
