import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/** Used when DEV_SERVER_PORT is not set; differs from cms-admin so both can run. */
const DEFAULT_DEV_SERVER_PORT = 5174;

export default defineConfig(({ mode }) => {
  // Dev-only keys (no VITE_ prefix, never reach the bundle). See .env.example.
  const env = loadEnv(mode, import.meta.dirname, '');
  const apiProxyTarget = env.DEV_API_PROXY_TARGET;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.DEV_SERVER_PORT ?? DEFAULT_DEV_SERVER_PORT),
      strictPort: true,
      // Mirrors production: /api on the web origin goes to cms-api unchanged.
      ...(apiProxyTarget
        ? { proxy: { '/api': { target: apiProxyTarget } } }
        : {}),
    },
    test: {
      environment: 'jsdom',
      globals: true,
      // Replaces .env files in tests.
      env: { VITE_API_BASE_URL: '/api/v1' },
      setupFiles: ['./test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
