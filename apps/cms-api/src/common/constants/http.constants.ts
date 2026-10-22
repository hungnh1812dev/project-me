import { RETRY_AFTER_HEADER } from './limits.constants';

/** Header that carries the per-request correlation id, in and out. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Inbound request ids are accepted only if they match this shape. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** Express app settings (see https://expressjs.com/en/5x/api.html#app.settings.table). */
export const EXPRESS_SETTINGS = {
  STRICT_ROUTING: 'strict routing',
  TRUST_PROXY: 'trust proxy',
  X_POWERED_BY: 'x-powered-by',
} as const;

/** CORS for the admin origin (SPEC §6, D14). Origins come from config only. */
export const CORS_ALLOWED_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
] as const;

export const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  REQUEST_ID_HEADER,
] as const;

/**
 * Response headers cross-origin JS may read: the request id, and
 * `Retry-After` so the admin can say how long to wait after a 429 (T11).
 */
export const CORS_EXPOSED_HEADERS = [
  REQUEST_ID_HEADER,
  RETRY_AFTER_HEADER,
] as const;

/** How long browsers may cache a preflight result. */
export const CORS_PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * API response hardening (SPEC D17): the API serves JSON only, so no
 * resource may load from it and it may not be framed. Traefik adds none.
 */
export const CONTENT_SECURITY_POLICY_HEADER = 'content-security-policy';
export const API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; frame-ancestors 'none'";
