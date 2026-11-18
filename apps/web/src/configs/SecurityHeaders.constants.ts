// No imports: next.config.ts loads this file before the app is built.

/** Response headers sent on every page via `next.config.ts` (SPEC D17). */
export const HSTS_MAX_AGE_SECONDS = 63_072_000;
export const SECURITY_RESPONSE_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`,
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
] as const;

/** Static policy for `/api/*` (`BFF_BASE_PATH`): the proxy skips these paths, so an unmatched one (Next's HTML 404) would carry no CSP. */
export const BFF_RESPONSE_HEADERS = [
  { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
] as const;
