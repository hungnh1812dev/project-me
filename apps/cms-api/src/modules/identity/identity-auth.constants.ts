import type { CookieOptions } from 'express';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './identity.constants';
import { API_PREFIX } from '../../common/constants/api.constants';
import {
  MS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from '../../common/constants/time.constants';
import { AUTH_ROUTES } from './identity.routes';

/** SPEC §6: access token lifetime (15 min). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * SECONDS_PER_MINUTE;

/** SPEC §6: a reviewer session lasts 24 h; its access token expires then too. */
export const REVIEWER_SESSION_TTL_SECONDS = 24 * SECONDS_PER_HOUR;

/** SPEC §6: refresh token lifetime (7 days), restarted on every rotation. */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * SECONDS_PER_DAY;
export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_SECONDS * MS_PER_SECOND;

/**
 * T11a: an already-rotated refresh token that comes back this soon after its
 * rotation, while its successor is still unused, is a concurrent refresh
 * (two tabs, a retried request), not reuse. 10 s covers one slow round trip
 * plus tabs that wake from sleep together, and is tiny next to the 15 min
 * access token. Such a request gets an access token only (no new refresh
 * token), so a replay inside the window can't gain a lasting session.
 */
export const REFRESH_TOKEN_REUSE_GRACE_SECONDS = 10;
export const REFRESH_TOKEN_REUSE_GRACE_MS =
  REFRESH_TOKEN_REUSE_GRACE_SECONDS * MS_PER_SECOND;

/** SPEC §6: 2FA temp token lifetime (300 s). */
export const TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS = 300;
/** SPEC §6: code checks allowed per temp token; then the token is dead. */
export const TWO_FACTOR_TEMP_TOKEN_MAX_ATTEMPTS = 5;
/** Generous bound on a raw temp token (a JWT is ~300 characters). */
export const TWO_FACTOR_TEMP_TOKEN_MAX_LENGTH = 2_048;
/**
 * Most live temp tokens the in-memory challenge store tracks (T13, Q7). Each
 * entry is ~150 bytes; at the cap expired entries are swept, then new
 * challenges are refused (429, fail closed) like the rate-limit store.
 */
export const TWO_FACTOR_CHALLENGE_MAX_KEYS = 10_000;

/** D9: the only accepted JWT algorithm. Every other alg, `none` included, is rejected. */
export const JWT_ALGORITHM = 'HS256';

/**
 * `typ` claim that separates access tokens from 2FA temp tokens, so a temp
 * token can never pass the access-token strategy.
 */
export const TOKEN_TYPES = {
  ACCESS: 'access',
  TWO_FACTOR: '2fa',
} as const;

/** Passport strategy name of the Bearer access-token strategy. */
export const JWT_STRATEGY_NAME = 'jwt';

/** Entropy of an opaque refresh token (256 bits). */
export const REFRESH_TOKEN_BYTES = 32;
/** Refresh tokens are stored only as this digest (hex) of the raw value. */
export const REFRESH_TOKEN_HASH_ALGORITHM = 'sha256';

/** SPEC §6 / D14: refresh cookie. Host-only: never set a Domain attribute. */
export const REFRESH_COOKIE = {
  NAME: '__Secure-abyss_rt',
  PATH: `/${API_PREFIX}/${AUTH_ROUTES.ROOT}`,
  HTTP_ONLY: true,
  SECURE: true,
  SAME_SITE: 'strict',
} as const;

/** SPEC §6 attributes. No `domain`: the cookie must stay host-only. */
export const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: REFRESH_COOKIE.HTTP_ONLY,
  secure: REFRESH_COOKIE.SECURE,
  sameSite: REFRESH_COOKIE.SAME_SITE,
  path: REFRESH_COOKIE.PATH,
};

/** Request header checked by the refresh/logout Origin allowlist (D14). */
export const ORIGIN_HEADER = 'origin';

/** RFC 5321 path limit; longer input can't be a stored email. */
export const EMAIL_MAX_LENGTH = 254;

/** Stored `refresh_tokens.user_agent` is cut to this many characters. */
export const USER_AGENT_MAX_LENGTH = 512;

/** Random bytes behind the dummy hash used for unknown emails (timing parity). */
export const DUMMY_PASSWORD_BYTES = 32;

/** `errorCode` values of the auth endpoints. */
export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'AUTH_INVALID_REFRESH_TOKEN',
  ORIGIN_NOT_ALLOWED: 'AUTH_ORIGIN_NOT_ALLOWED',
  INVALID_REQUEST: 'AUTH_INVALID_REQUEST',
  /** Wrong, expired, used or exhausted code, or unknown email: one answer (D8). */
  INVALID_OTP: 'AUTH_INVALID_OTP',
  WEAK_PASSWORD: 'AUTH_WEAK_PASSWORD',
  /** Password reset of an account with TOTP needs an authenticator code (D8). */
  TOTP_REQUIRED: 'AUTH_TOTP_REQUIRED',
  /** Wrong, replayed or expired 2FA code: one answer for all (T13). */
  INVALID_2FA_CODE: 'AUTH_INVALID_2FA_CODE',
  /** 2FA temp token expired, used up, already used or forged. */
  INVALID_TEMP_TOKEN: 'AUTH_INVALID_TEMP_TOKEN',
  TWO_FACTOR_ALREADY_ENABLED: 'AUTH_2FA_ALREADY_ENABLED',
  TWO_FACTOR_NOT_ENABLED: 'AUTH_2FA_NOT_ENABLED',
  /** Enable with TOTP before `POST /auth/2fa/totp/setup`. */
  TWO_FACTOR_SETUP_REQUIRED: 'AUTH_2FA_SETUP_REQUIRED',
} as const;

/** Client-facing messages. Identical for every login failure (no enumeration). */
export const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  INVALID_REFRESH_TOKEN: 'Session expired, sign in again',
  ORIGIN_NOT_ALLOWED: 'Request origin is not allowed',
  INVALID_REQUEST: 'Email and password are required',
  JWT_NOT_CONFIGURED: 'JWT_ACCESS_SECRET is not configured',
  INVALID_PASSWORD_REQUEST: 'The request is missing required fields',
  INVALID_OTP: 'The code is invalid or has expired',
  WEAK_PASSWORD: `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
  TOTP_REQUIRED: 'A valid authenticator code is required',
  WRONG_CURRENT_PASSWORD: 'Current password is incorrect',
  INVALID_TWO_FACTOR_REQUEST: 'The request is missing required fields',
  INVALID_2FA_CODE: 'The code is invalid or has expired',
  INVALID_TEMP_TOKEN: 'Sign-in expired, sign in again',
  TWO_FACTOR_ALREADY_ENABLED: 'Two-factor authentication is already on',
  TWO_FACTOR_NOT_ENABLED: 'Two-factor authentication is off',
  TWO_FACTOR_SETUP_REQUIRED: 'Set up the authenticator app first',
} as const;
