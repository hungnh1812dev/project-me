import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/** Form-heavy component tests exceed the 5 s default when the whole monorepo's tests run in parallel. */
const TEST_TIMEOUT_MS = 20_000;

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/Vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    testTimeout: TEST_TIMEOUT_MS,
  },
});
