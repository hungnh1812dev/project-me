import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../modules/identity/identity.constants';
import { API_PREFIX, API_ROUTES } from './api.constants';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_DAY = 24 * 60 * SECONDS_PER_MINUTE;
const MS_PER_SECOND = 1_000;

/** SPEC §6: access token lifetime (15 min). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * SECONDS_PER_MINUTE;

/** SPEC §6: refresh token lifetime (7 days), restarted on every rotation. */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * SECONDS_PER_DAY;
export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_SECONDS * MS_PER_SECOND;

/** SPEC §6: 2FA temp token lifetime (300 s). Attempt counting is T13. */
export const TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS = 300;

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
  PATH: `/${API_PREFIX}/${API_ROUTES.AUTH.ROOT}`,
  HTTP_ONLY: true,
  SECURE: true,
  SAME_SITE: 'strict',
} as const;

/** Token responses must never be cached. */
export const NO_STORE_HEADER = { NAME: 'Cache-Control', VALUE: 'no-store' };

/** Request header checked by the refresh/logout Origin allowlist (D14). */
export const ORIGIN_HEADER = 'origin';

/** Request header stored with each refresh token. */
export const USER_AGENT_HEADER = 'user-agent';

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
} as const;
