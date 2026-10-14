import { defineConfig, devices } from '@playwright/test';

/** 6007 so the story tests never collide with a `storybook` dev server on 6006. */
const PORT = 6007;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `storybook dev --ci -p ${PORT} --host localhost`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // The first Storybook start optimises deps, which can take a while.
    timeout: 120_000,
  },
});
