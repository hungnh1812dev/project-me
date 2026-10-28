import { stripTrailingSlashes } from './StripTrailingSlashes.rules';

function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not set. See .env.example.`);
  }
  return value;
}

/** Typed, validated view of the Vite env. The only place that reads `import.meta.env`. */
export const appEnv = Object.freeze({
  apiBaseUrl: stripTrailingSlashes(
    requireEnv('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  ),
  /** Vite dev server or test run; enables the Redux DevTools hook. */
  isDev: import.meta.env.DEV,
});
