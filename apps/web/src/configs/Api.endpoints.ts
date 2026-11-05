/**
 * The single map of cms-api paths (SPEC §5), relative to `appEnv.apiBaseUrl`.
 * No trailing slashes; the API client strips them anyway.
 */
export const API_ENDPOINTS = {
  HEALTH: {
    LIVE: '/health/live',
    READY: '/health/ready',
  },
  AUTH: {
    LOGIN: '/auth/login',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
  },
  /** Read-only content queries (POST only). */
  GRAPHQL: '/graphql',
  /** Reviewer sessions: status is public, sessions is public for POST. */
  REVIEWER: {
    STATUS: '/reviewer/status',
    SESSIONS: '/reviewer/sessions',
  },
  TWO_FACTOR: {
    VERIFY: '/auth/2fa/verify',
    EMAIL_CHALLENGE: '/auth/2fa/email-challenge',
  },
} as const;

/** The browser's only API: the BFF routes of this site (ADR 0018). */
export const BFF_ENDPOINTS = {
  HEALTH: '/bff/v1/health',
  SESSION: '/bff/v1/session',
  CV: '/bff/v1/cv',
  LOGIN: '/bff/v1/auth/login',
  EMAIL_CODE: '/bff/v1/auth/two-factor/email-code',
  VERIFY_TWO_FACTOR: '/bff/v1/auth/two-factor/verify',
  LOGOUT: '/bff/v1/auth/logout',
} as const;
