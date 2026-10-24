import { REVIEWER_SESSION_TTL_SECONDS } from '../identity';

import {
  MS_PER_MINUTE,
  MS_PER_SECOND,
} from '../../common/constants/time.constants';

/** `app_settings.key` holding the owner's reviewer toggle (value: boolean). */
export const REVIEWER_ENABLED_SETTING_KEY = 'reviewer.enabled';

/** The session row ends when the access token does; identity owns the lifetime. */
export const REVIEWER_SESSION_TTL_MS =
  REVIEWER_SESSION_TTL_SECONDS * MS_PER_SECOND;

/** SPEC §6: 1 session per IP per 10 min, 200 active sessions at most. */
export const REVIEWER_IP_WINDOW_MS = 10 * MS_PER_MINUTE;
export const REVIEWER_MAX_ACTIVE_SESSIONS = 200;

/** Sweep of expired reviewer accounts (in-process, like the media purge). */
export const REVIEWER_CLEANUP_INTERVAL_MS = 10 * MS_PER_MINUTE;
export const REVIEWER_CLEANUP_BATCH_SIZE = 100;

/** Limits of the visitor's input (SPEC §8.1: notes at most 500 characters, plain text). */
export const REVIEWER_INPUT_LIMITS = {
  VISITOR_ROLE_MAX_LENGTH: 64,
  PURPOSE_TAG_MAX_LENGTH: 40,
  PURPOSE_TAGS_MAX: 10,
  NOTES_MAX_LENGTH: 500,
} as const;

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

/** Keyed HMAC of the visitor IP (`reviewer_sessions.ip_hmac`), derived from OTP_PEPPER. */
export const REVIEWER_IP_HMAC = {
  HKDF_DIGEST: 'sha256',
  HKDF_INFO: 'abyss/reviewer-ip/v1',
  KEY_BYTES: 32,
  HMAC_ALGORITHM: 'sha256',
} as const;

/** Postgres advisory lock serialising session creation (cap and per-IP rule). */
export const REVIEWER_SESSION_LOCK = 1_700_031_001;

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
