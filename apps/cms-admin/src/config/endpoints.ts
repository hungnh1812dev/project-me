/**
 * The single map of cms-api paths (SPEC §5, §9), relative to
 * `appEnv.apiBaseUrl`. No trailing slashes; the API client strips them anyway.
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
  PASSWORD: {
    REQUEST_OTP: '/auth/password/request-otp',
    RESET: '/auth/password/reset',
    SET: '/auth/password/set',
    CHANGE: '/auth/password/change',
  },
  /** T13 two-factor endpoints. */
  TWO_FACTOR: {
    TOTP_SETUP: '/auth/2fa/totp/setup',
    ENABLE: '/auth/2fa/enable',
    DISABLE: '/auth/2fa/disable',
    VERIFY: '/auth/2fa/verify',
    EMAIL_CHALLENGE: '/auth/2fa/email-challenge',
    EMAIL_SEND_CODE: '/auth/2fa/email/send-code',
  },
  /** T17 accounts API. `id` is the account's document id. */
  ACCOUNTS: {
    LIST: '/accounts',
    DISABLE: (id: string) => `/accounts/${encodeURIComponent(id)}/disable`,
  },
  /** T17 roles API. `id` is the role's document id. */
  ROLES: {
    LIST: '/roles',
    PERMISSIONS: (id: string) => `/roles/${encodeURIComponent(id)}/permissions`,
  },
  /** T17b read-only content types (field paths for the permission matrix). */
  CONTENT_TYPES: {
    LIST: '/content-types',
  },
} as const;
