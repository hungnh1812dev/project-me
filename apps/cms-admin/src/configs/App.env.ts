import { stripTrailingSlashes } from './StripTrailingSlashes.rules';

function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not set. See .env.example.`);
  }
  return value;
}

function originOf(name: string, value: string): string {
  try {
    return new URL(value, window.location.origin).origin;
  } catch {
    throw new Error(`${name} is not a valid URL. See .env.example.`);
  }
}

const apiBaseUrl = stripTrailingSlashes(
  requireEnv('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
);

/** Typed, validated view of the Vite env. The only place that reads `import.meta.env`. */
export const appEnv = Object.freeze({
  apiBaseUrl,
  /** Origin of cms-api for root paths outside `/api/v1`; a relative base URL (dev proxy) gives the page origin. */
  apiOrigin: originOf('VITE_API_BASE_URL', apiBaseUrl),
  /** Cloudflare Turnstile site key (public by design); read once by `configureTurnstile` in `main.tsx`. */
  turnstileSiteKey: requireEnv('VITE_TURNSTILE_SITE_KEY', import.meta.env.VITE_TURNSTILE_SITE_KEY),
  /** Vite dev server or test run; enables the Redux DevTools hook. */
  isDev: import.meta.env.DEV,
});
