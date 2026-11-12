import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Form-heavy page tests exceed the 5 s default when the whole monorepo's tests run in parallel. */
const TEST_TIMEOUT_MS = 20_000;

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolves the `@/` imports from the tsconfig `paths`.
    tsconfigPaths: true,
    alias: {
      // The real package throws outside the Next server bundle.
      'server-only': path.join(import.meta.dirname, 'test/ServerOnly.fixture.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Replaces .env files in tests.
    env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' },
    setupFiles: ['./test/Vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: TEST_TIMEOUT_MS,
  },
});
