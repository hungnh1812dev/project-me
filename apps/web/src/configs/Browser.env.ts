import { requireEnv } from './RequireEnv.rules';

/**
 * Typed, validated view of the browser-visible env. `NEXT_PUBLIC_*` values are
 * inlined at build time, so each must be referenced literally (no dynamic
 * `process.env[name]`). A missing key fails the build.
 */
export const appEnv = Object.freeze({
  /**
   * Cloudflare Turnstile site key (public by design). Required: a build
   * without it fails.
   */
  turnstileSiteKey: requireEnv(
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  ),
});
