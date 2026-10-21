import { stripTrailingSlashes } from '../lib/strip-trailing-slashes';
import { requireEnv } from './require-env';

/**
 * Typed, validated view of the browser-visible env. `NEXT_PUBLIC_*` values are
 * inlined at build time, so each must be referenced literally (no dynamic
 * `process.env[name]`). A missing key fails the build.
 */
export const appEnv = Object.freeze({
  apiBaseUrl: stripTrailingSlashes(
    requireEnv(
      'NEXT_PUBLIC_API_BASE_URL',
      process.env.NEXT_PUBLIC_API_BASE_URL,
    ),
  ),
});
