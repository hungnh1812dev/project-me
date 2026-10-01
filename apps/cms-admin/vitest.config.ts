import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const LOGIC_THRESHOLD = { lines: 85, statements: 85, functions: 85, branches: 85 };
const UI_THRESHOLD = { lines: 70, statements: 70, functions: 70, branches: 70 };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/**/*.d.ts',
        'src/test/**',
        'src/**/types.ts',
        'src/**/*.test.{ts,tsx}',
      ],
      thresholds: {
        'src/core/**/*.ts': LOGIC_THRESHOLD,
        'src/app/**/*.ts': LOGIC_THRESHOLD,
        'src/features/**/*.ts': LOGIC_THRESHOLD,
        'src/utils/**/*.ts': LOGIC_THRESHOLD,
        'src/**/*.tsx': UI_THRESHOLD,
      },
    },
  },
});
