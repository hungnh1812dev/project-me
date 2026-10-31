import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/** Used when DEV_SERVER_PORT is not set; differs from web so both can run. */
const DEFAULT_DEV_SERVER_PORT = 5173;

export default defineConfig(({ mode }) => {
  // Dev-only keys (no VITE_ prefix, never reach the bundle). See .env.example.
  const env = loadEnv(mode, import.meta.dirname, '');

  return {
    plugins: [
      react(),
      tailwindcss(),
      visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    // Path aliases come from tsconfig.json `paths`.
    resolve: { tsconfigPaths: true },
    server: {
      port: Number(env.DEV_SERVER_PORT ?? DEFAULT_DEV_SERVER_PORT),
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      // Replaces .env files in tests.
      env: { VITE_API_BASE_URL: 'http://domain.localhost/api/v1' },
      setupFiles: ['./test/Vitest.setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            if (
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/@remix-run/')
            ) {
              return 'vendor-router';
            }
            if (id.includes('node_modules/@tiptap/') || id.includes('node_modules/prosemirror')) {
              return 'vendor-ui-editor';
            }
            if (id.includes('node_modules')) {
              return 'vendor';
            }
            return null;
          },
        },
      },
    },
  };
});
