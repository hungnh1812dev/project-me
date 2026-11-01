import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Form-heavy page tests exceed the 5 s default when the whole monorepo's tests run in parallel. */
const TEST_TIMEOUT_MS = 20_000;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The real package throws outside the Next server bundle.
      'server-only': path.join(import.meta.dirname, 'test/ServerOnly.fixture.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Replaces .env files in tests.
    env: { NEXT_PUBLIC_API_BASE_URL: '/api/v1' },
    setupFiles: ['./test/Vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: TEST_TIMEOUT_MS,
  },
});
