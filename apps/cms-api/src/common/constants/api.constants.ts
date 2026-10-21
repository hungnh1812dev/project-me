/** Global route prefix (SPEC §6). Express adds the leading slash. */
export const API_PREFIX = 'api/v1';

export const API_ROUTES = {
  HEALTH: {
    ROOT: 'health',
    LIVE: 'live',
    READY: 'ready',
  },
  AUTH: {
    ROOT: 'auth',
    LOGIN: 'login',
    REFRESH: 'refresh',
    LOGOUT: 'logout',
    ME: 'me',
  },
  /** SPEC §9 password lifecycle (T12), under /auth/password. */
  PASSWORD: {
    ROOT: 'auth/password',
    REQUEST_OTP: 'request-otp',
    RESET: 'reset',
    SET: 'set',
    CHANGE: 'change',
  },
  /** SPEC §9 two-factor endpoints (T13), under /auth/2fa. */
  TWO_FACTOR: {
    ROOT: 'auth/2fa',
    TOTP_SETUP: 'totp/setup',
    ENABLE: 'enable',
    DISABLE: 'disable',
    VERIFY: 'verify',
    EMAIL_CHALLENGE: 'email-challenge',
    /** T13 Q9: emailed code for enable/disable of email 2FA (signed in). */
    EMAIL_SEND_CODE: 'email/send-code',
  },
  /** SPEC §9 accounts (T17). `:id` is the account's document_id. */
  ACCOUNTS: {
    ROOT: 'accounts',
    BY_ID: ':id',
    DISABLE: ':id/disable',
    REVOKE_SESSIONS: ':id/sessions/revoke',
    ENABLE: ':id/enable',
    RESEND_INVITE: ':id/invite/resend',
  },
  /** SPEC §9 roles (T17). `:id` is the role's document_id. */
  ROLES: {
    ROOT: 'roles',
    BY_ID: ':id',
    PERMISSIONS: ':id/permissions',
  },
  /** SPEC §9 API tokens (T19). `:id` is the token's document_id. */
  API_TOKENS: {
    ROOT: 'api-tokens',
    BY_ID: ':id',
    REVOKE: ':id/revoke',
  },
  /** SPEC §9 content types (T17b), read-only. `:slug` is a registry slug. */
  CONTENT_TYPES: {
    ROOT: 'content-types',
    BY_SLUG: ':slug',
  },
  /** SPEC §9 documents (T20 read). `:documentId` is the record's document_id. */
  DOCUMENTS: {
    ROOT: 'documents',
    BY_SLUG: ':slug',
    BY_ID: ':slug/:documentId',
    PUBLISH: ':slug/:documentId/publish',
    UNPUBLISH: ':slug/:documentId/unpublish',
    PRESENCE: ':slug/:documentId/presence',
  },
  /** SPEC §9 media (T27 upload + list, T28 delete). */
  MEDIA: {
    ROOT: 'media',
    BY_ID: ':id',
  },
} as const;

/** Route param holding a document_id in API_ROUTES.ACCOUNTS / ROLES. */
export const ID_PARAM = 'id';

/** Route param holding a content type slug in API_ROUTES.CONTENT_TYPES. */
export const SLUG_PARAM = 'slug';

/** Route param holding a record's document_id in API_ROUTES.DOCUMENTS. */
export const DOCUMENT_ID_PARAM = 'documentId';
