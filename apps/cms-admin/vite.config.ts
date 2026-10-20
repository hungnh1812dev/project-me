import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/** Used when DEV_SERVER_PORT is not set; differs from web so both can run. */
const DEFAULT_DEV_SERVER_PORT = 5173;

export default defineConfig(({ mode }) => {
  // Dev-only keys (no VITE_ prefix, never reach the bundle). See .env.example.
  const env = loadEnv(mode, import.meta.dirname, '');

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.DEV_SERVER_PORT ?? DEFAULT_DEV_SERVER_PORT),
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      // Replaces .env files in tests.
      env: { VITE_API_BASE_URL: 'http://domain.localhost/api/v1' },
      setupFiles: ['./test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
