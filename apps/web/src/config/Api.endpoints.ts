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
