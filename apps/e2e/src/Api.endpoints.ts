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
  CONTENT_TYPES_VALIDATE: '/content-types/validate',
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
  PREFIX: '/api/v1/',
  HEALTH: '/api/v1/health',
  SESSION: '/api/v1/session',
  CV: '/api/v1/cv',
  AUTH: {
    LOGIN: '/api/v1/auth/login',
    LOGOUT: '/api/v1/auth/logout',
    TWO_FACTOR_VERIFY: '/api/v1/auth/two-factor/verify',
    TWO_FACTOR_EMAIL_CODE: '/api/v1/auth/two-factor/email-code',
  },
} as const;

/** Removed BFF path (pure rename to `/api/v1`, no alias): every route under it answers 404. */
export const REMOVED_BFF_PATHS = {
  HEALTH: '/bff/v1/health',
  SESSION: '/bff/v1/session',
  CV: '/bff/v1/cv',
  LOGIN: '/bff/v1/auth/login',
} as const;

const BFF_ROUTES: readonly string[] = [
  BFF_PATHS.HEALTH,
  BFF_PATHS.SESSION,
  BFF_PATHS.CV,
  ...Object.values(BFF_PATHS.AUTH),
];

/**
 * True for a browser request that reaches cms-api instead of the BFF. The BFF and cms-api
 * share the `/api/v1` prefix, so they are told apart by origin; when the stack serves both
 * on one origin, a web-origin `/api/` path that is not a known BFF route counts as a stray call.
 */
export const isCmsApiRequest = (url: string): boolean => {
  const target = new URL(url);
  const cmsApi = new URL(e2eEnv.apiBaseUrl);
  const web = new URL(e2eEnv.webUrl);
  if (target.origin === cmsApi.origin && target.origin !== web.origin) return true;
  return (
    target.origin === web.origin &&
    target.pathname.startsWith('/api/') &&
    !BFF_ROUTES.includes(target.pathname)
  );
};
