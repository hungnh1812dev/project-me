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
] as const;
