import { MS_PER_SECOND } from '../../common/constants/time.constants';

/** Cloudflare's server-side verification endpoint (provider contract, not config). */
export const TURNSTILE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Verification must not hold a request open longer than this. */
export const TURNSTILE_TIMEOUT_MS = 5 * MS_PER_SECOND;

/** Form fields of the siteverify request. */
export const TURNSTILE_FIELDS = {
  SECRET: 'secret',
  RESPONSE: 'response',
  REMOTE_IP: 'remoteip',
} as const;

/** Error code Cloudflare uses when its own side failed (retryable, not the visitor's fault). */
export const TURNSTILE_INTERNAL_ERROR = 'internal-error';
