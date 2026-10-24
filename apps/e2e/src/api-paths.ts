import { e2eEnv } from './env';

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
  REVIEWER: {
    SETTINGS: '/reviewer/settings',
    SESSIONS: '/reviewer/sessions',
    STATUS: '/reviewer/status',
  },
  documents: (slug: string) => `/documents/${slug}`,
  document: (slug: string, id: string) => `/documents/${slug}/${id}`,
  documentsBulk: (slug: string) => `/documents/${slug}/bulk`,
  media: (id: string) => `/media/${id}`,
  /** Tail of the presence route under a document. */
  PRESENCE_SEGMENT: '/presence',
} as const;

/** Absolute URL of a cms-api path. */
export const apiUrl = (path: string): string => `${e2eEnv.apiBaseUrl}${path}`;
