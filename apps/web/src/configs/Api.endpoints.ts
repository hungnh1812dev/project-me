/**
 * The single map of cms-api paths (SPEC §5), relative to `APP_API_URL`.
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
  TWO_FACTOR: {
    VERIFY: '/auth/2fa/verify',
    EMAIL_CHALLENGE: '/auth/2fa/email-challenge',
  },
} as const;

/** Base path of the BFF routes of this site (ADR 0018), the route folder `app/api/v1/`; the browser's only API. */
export const BFF_BASE_PATH = '/api/v1';

/** BFF routes, relative to `BFF_BASE_PATH`. */
export const BFF_ENDPOINTS = {
  HEALTH: '/health',
  SESSION: '/session',
  /** One CV by its `documentId`; the segment is encoded. */
  CV: (documentId: string) => `/cv/${encodeURIComponent(documentId)}` as const,
  LOGIN: '/auth/login',
  EMAIL_CODE: '/auth/two-factor/email-code',
  VERIFY_TWO_FACTOR: '/auth/two-factor/verify',
  LOGOUT: '/auth/logout',
} as const;

/** Crawler files the site serves (PS-4); `proxy.ts` and `next.config.ts` name these paths too. */
export const CRAWLER_FILE_PATHS = {
  ROBOTS: '/robots.txt',
  SITEMAP: '/sitemap.xml',
} as const;

/** Public pages the sitemap lists (PS-4); a new public page is one entry. */
export const SITEMAP_PAGE_PATHS = ['/', '/status'] as const;
