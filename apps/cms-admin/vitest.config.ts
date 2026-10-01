import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const LOGIC_THRESHOLD = { lines: 85, statements: 85, functions: 85, branches: 85 };
const UI_THRESHOLD = { lines: 70, statements: 70, functions: 70, branches: 70 };

// Draft files that later small phases rewrite in place. Each entry is removed by the
// phase that rewrites the file, so its new code is measured against the gates.
const PENDING_REWRITE = [
  'src/App.tsx', // 1.5
  'src/pages/login/LoginPage.tsx', // 1.5
  'src/pages/profile/ProfilePage.tsx', // 1.5
];

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
        ...PENDING_REWRITE,
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
