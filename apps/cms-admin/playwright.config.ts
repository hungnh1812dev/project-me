import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;
/** The `csp` project serves the production build with `vite preview`, under `preview.headers`. */
const CSP_PORT = 5175;
const CSP_BASE_URL = `http://localhost:${CSP_PORT}`;
/** Kept out of `dist/` so the e2e build never replaces the real one. */
const CSP_OUT_DIR = 'node_modules/.tmp/e2e-csp';
const CSP_SPEC = /csp\.spec\.ts$/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: CSP_SPEC },
    {
      name: 'csp',
      use: { ...devices['Desktop Chrome'], baseURL: CSP_BASE_URL },
      testMatch: CSP_SPEC,
    },
    // The JSON editor's shadow-root styling is engine-specific (constructed stylesheets).
    {
      name: 'csp-firefox',
      use: { ...devices['Desktop Firefox'], baseURL: CSP_BASE_URL },
      testMatch: CSP_SPEC,
    },
    {
      name: 'csp-webkit',
      use: { ...devices['Desktop Safari'], baseURL: CSP_BASE_URL },
      testMatch: CSP_SPEC,
    },
  ],
  webServer: [
    {
      command: `vite --port ${PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      // Empty API URL: the app calls the relative /api/v1, which every spec mocks with page.route.
      env: { VITE_API_URL: '' },
    },
    {
      command: `vite build --outDir ${CSP_OUT_DIR} --emptyOutDir && vite preview --outDir ${CSP_OUT_DIR} --port ${CSP_PORT} --strictPort`,
      url: CSP_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // The policy `preview.headers` sends: same-origin API, thumbnails from the fake media host.
      env: { VITE_API_URL: '', CSP_API_ORIGIN: '', CSP_IMG_ORIGINS: 'https://media.example.test' },
    },
  ],
});
