import { e2eEnv } from './E2e.env';

/**
 * cms-api paths the specs call or watch, relative to `e2eEnv.apiBaseUrl`.
 * The only file that spells them out; `eslint.config.mjs` rejects them elsewhere.
 */
export const API_PATHS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    REFRESH: '/auth/refresh',
    ME: '/auth/me',
    REQUEST_OTP: '/auth/password/request-otp',
    PASSWORD_RESET: '/auth/password/reset',
  },
  SETUP: {
    STATUS: '/setup/status',
    OWNER: '/setup/owner',
  },
  /** Prefix shared by every auth route. */
  AUTH_PREFIX: '/auth/',
  ACCOUNTS: '/accounts',
  API_TOKENS: '/api-tokens',
  GRAPHQL: '/graphql',
  MEDIA: '/media',
  ROLES: '/roles',
  REVIEWER: {
    SETTINGS: '/reviewer/settings',
    SESSIONS: '/reviewer/sessions',
    STATUS: '/reviewer/status',
  },
  documents: (slug: string) => `/documents/${slug}`,
  document: (slug: string, id: string) => `/documents/${slug}/${id}`,
  documentPublish: (slug: string, id: string) => `/documents/${slug}/${id}/publish`,
  documentDiscard: (slug: string, id: string) => `/documents/${slug}/${id}/discard`,
  documentsBulk: (slug: string) => `/documents/${slug}/bulk`,
  media: (id: string) => `/media/${id}`,
  /** Tail of the presence route under a document. */
  PRESENCE_SEGMENT: '/presence',
} as const;

/** Absolute URL of a cms-api path. */
export const apiUrl = (path: string): string => `${e2eEnv.apiBaseUrl}${path}`;

/** web BFF paths, relative to `e2eEnv.webUrl`. The browser calls only these on the web origin. */
export const BFF_PATHS = {
  PREFIX: '/bff/v1/',
  HEALTH: '/bff/v1/health',
  SESSION: '/bff/v1/session',
  CV: '/bff/v1/cv',
  AUTH: {
    LOGIN: '/bff/v1/auth/login',
    LOGOUT: '/bff/v1/auth/logout',
    TWO_FACTOR_VERIFY: '/bff/v1/auth/two-factor/verify',
    TWO_FACTOR_EMAIL_CODE: '/bff/v1/auth/two-factor/email-code',
  },
} as const;
