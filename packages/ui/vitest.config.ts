import { defineConfig } from 'vitest/config';

const LOGIC_THRESHOLD = { lines: 85, statements: 85, functions: 85, branches: 85 };
const UI_THRESHOLD = { lines: 70, statements: 70, functions: 70, branches: 70 };

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        // Vendored shadcn primitives; their custom behaviour is tested from src/form.
        'src/components/**',
      ],
      thresholds: {
        'src/lib/**/*.ts': LOGIC_THRESHOLD,
        'src/styles/tokens.ts': LOGIC_THRESHOLD,
        'src/form/**/*.tsx': UI_THRESHOLD,
      },
    },
  },
});
