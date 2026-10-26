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
  /** One-time owner setup; public, no token needed for the status. */
  SETUP: {
    STATUS: '/setup/status',
    OWNER: '/setup/owner',
  },
  PASSWORD: {
    REQUEST_OTP: '/auth/password/request-otp',
    RESET: '/auth/password/reset',
    SET: '/auth/password/set',
    CHANGE: '/auth/password/change',
  },
  /** Two-factor endpoints. */
  TWO_FACTOR: {
    TOTP_SETUP: '/auth/2fa/totp/setup',
    ENABLE: '/auth/2fa/enable',
    DISABLE: '/auth/2fa/disable',
    VERIFY: '/auth/2fa/verify',
    EMAIL_CHALLENGE: '/auth/2fa/email-challenge',
    EMAIL_SEND_CODE: '/auth/2fa/email/send-code',
  },
  /** Accounts API. `id` is the account's document id. */
  ACCOUNTS: {
    LIST: '/accounts',
    DISABLE: (id: string) => `/accounts/${encodeURIComponent(id)}/disable`,
    ENABLE: (id: string) => `/accounts/${encodeURIComponent(id)}/enable`,
    RESEND_INVITE: (id: string) =>
      `/accounts/${encodeURIComponent(id)}/invite/resend`,
  },
  /** Roles API. `id` is the role's document id. */
  ROLES: {
    LIST: '/roles',
    PERMISSIONS: (id: string) => `/roles/${encodeURIComponent(id)}/permissions`,
  },
  /** API tokens. `id` is the token's document id. */
  API_TOKENS: {
    LIST: '/api-tokens',
    ONE: (id: string) => `/api-tokens/${encodeURIComponent(id)}`,
    REVOKE: (id: string) => `/api-tokens/${encodeURIComponent(id)}/revoke`,
  },
  /** Read-only content types (field paths for the permission matrix). */
  CONTENT_TYPES: {
    LIST: '/content-types',
    ONE: (slug: string) => `/content-types/${encodeURIComponent(slug)}`,
  },
  /** Reviewer sessions (owner) and the on/off switch. */
  REVIEWER: {
    STATUS: '/reviewer/status',
    SESSIONS: '/reviewer/sessions',
    SETTINGS: '/reviewer/settings',
  },
  /** Media library. `id` = the file's uuid. */
  MEDIA: {
    LIST: '/media',
    ONE: (id: string) => `/media/${encodeURIComponent(id)}`,
  },
  /** Documents. `slug` = content type, `id` = document id. */
  DOCUMENTS: {
    BY_SLUG: (slug: string) => `/documents/${encodeURIComponent(slug)}`,
    BY_ID: (slug: string, id: string) =>
      `/documents/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`,
    /** Bulk: `action` is create | publish | unpublish | delete. */
    BULK: (slug: string, action: string) =>
      `/documents/${encodeURIComponent(slug)}/bulk/${encodeURIComponent(action)}`,
    PRESENCE: (slug: string, id: string) =>
      `/documents/${encodeURIComponent(slug)}/${encodeURIComponent(id)}/presence`,
  },
} as const;
