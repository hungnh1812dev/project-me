import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import pkg from './package.json' with { type: 'json' };
import { buildContentSecurityPolicy } from './src/core/security/csp.ts';

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
    // `vite preview` sends the production headers (SEC-4), built from the same runtime vars
    // as the nginx template, so the `csp` e2e project checks the built app under the policy.
    preview: {
      headers: {
        'Content-Security-Policy': buildContentSecurityPolicy({
          apiOrigin: env.CSP_API_ORIGIN ?? '',
          imgOrigins: env.CSP_IMG_ORIGINS ?? '',
        }),
        'Referrer-Policy': 'same-origin',
      },
    },
  };
});
