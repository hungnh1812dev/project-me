import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import pkg from './package.json' with { type: 'json' };

const DEFAULT_PROXY_TARGET = 'http://localhost:8080';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_PROXY_TARGET || DEFAULT_PROXY_TARGET;

  return {
    plugins: [react(), tailwindcss()],
    // The app version shown in the footer, read from package.json at build time.
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // Dev only: the browser calls the relative `/api/v1`, and Vite forwards it, so the
      // refresh cookie stays first-party and the backend needs no CORS entry for :5173.
      proxy: {
        '/api': { target, changeOrigin: true },
        '/health': { target, changeOrigin: true },
      },
    },
  };
});
