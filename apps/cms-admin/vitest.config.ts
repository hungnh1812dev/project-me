import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import pkg from './package.json' with { type: 'json' };

const LOGIC_THRESHOLD = { lines: 85, statements: 85, functions: 85, branches: 85 };
const UI_THRESHOLD = { lines: 70, statements: 70, functions: 70, branches: 70 };

export default defineConfig({
  plugins: [react()],
  // Same as vite.config.ts: the footer reads the app version.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
        // Vendored shadcn primitives; their custom behaviour is tested from src/components/form.
        'src/components/ui/**',
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
