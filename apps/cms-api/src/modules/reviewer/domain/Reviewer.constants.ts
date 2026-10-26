import { REVIEWER_SESSION_TTL_SECONDS } from '../../identity';

import { MS_PER_SECOND } from '../../../common/constants/time.constants';

/** The session row ends when the access token does; identity owns the lifetime. */
export const REVIEWER_SESSION_TTL_MS =
  REVIEWER_SESSION_TTL_SECONDS * MS_PER_SECOND;

/** Limits of the visitor's input (SPEC §8.1: notes at most 500 characters, plain text). */
export const REVIEWER_INPUT_LIMITS = {
  VISITOR_ROLE_MAX_LENGTH: 64,
  PURPOSE_TAG_MAX_LENGTH: 40,
  PURPOSE_TAGS_MAX: 10,
  NOTES_MAX_LENGTH: 500,
} as const;

/** Cloudflare documents Turnstile response tokens of at most 2048 characters. */
export const TURNSTILE_TOKEN_MAX_LENGTH = 2_048;

/** Ephemeral reviewer accounts get an address nobody can receive mail on (RFC 6761). */
export const REVIEWER_ACCOUNT = {
  EMAIL_PREFIX: 'reviewer-',
  EMAIL_DOMAIN: 'reviewer.invalid',
  DISPLAY_NAME: 'Reviewer',
  /**
   * `accounts.token_version` a session is created with (the column default).
   * Switching off bumps it, so any other value means the session was revoked.
   */
  INITIAL_TOKEN_VERSION: 1,
} as const;

export const REVIEWER_ERROR_CODES = {
  /** Reviewer access is switched off by the owner. */
  DISABLED: 'REVIEWER_DISABLED',
  /** Turnstile or the IP key is not configured, or Turnstile could not be reached. */
  UNAVAILABLE: 'REVIEWER_UNAVAILABLE',
  TURNSTILE_FAILED: 'REVIEWER_TURNSTILE_FAILED',
  IP_LIMITED: 'REVIEWER_IP_LIMITED',
  CAPACITY_REACHED: 'REVIEWER_CAPACITY_REACHED',
} as const;

export const REVIEWER_ERROR_MESSAGES = {
  DISABLED: 'Reviewer access is not enabled.',
  UNAVAILABLE: 'Reviewer access is temporarily unavailable.',
  TURNSTILE_FAILED: 'The verification check failed. Try again.',
  IP_LIMITED: 'A reviewer session was already started from this address.',
  CAPACITY_REACHED: 'Too many reviewer sessions are active. Try again later.',
} as const;
