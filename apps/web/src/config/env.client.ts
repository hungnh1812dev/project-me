import { stripTrailingSlashes } from '../lib/strip-trailing-slashes';
import { optionalLinkTarget, requireEnv } from './require-env';

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
  /**
   * Admin console URL for the "Open CMS" link. Optional: the link is hidden
   * when unset. An absolute http(s) URL or a path; no trailing slash.
   */
  adminUrl: optionalLinkTarget(
    'NEXT_PUBLIC_ADMIN_URL',
    process.env.NEXT_PUBLIC_ADMIN_URL,
  ),
});
