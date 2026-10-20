import { defineConfig, devices } from '@playwright/test';

import { CI_RETRIES, EXPECT_TIMEOUT_MS } from './src/constants';
import { e2eEnv } from './src/env';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: e2eEnv.ci,
  retries: e2eEnv.ci ? CI_RETRIES : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: { timeout: EXPECT_TIMEOUT_MS },
  use: {
    baseURL: e2eEnv.adminUrl,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
