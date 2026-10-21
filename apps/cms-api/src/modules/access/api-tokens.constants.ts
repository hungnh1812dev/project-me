/** API tokens (SPEC D5, T19). */
export const API_TOKEN = {
  /** Every raw token starts with this; anything else is not a token. */
  PREFIX: 'ak_live_',
  /** Random bytes after the prefix (base64url, 43 characters). */
  RANDOM_BYTES: 32,
  HASH_ALGORITHM: 'sha256',
  /** Leading characters of the raw token kept for lists (prefix + 4). */
  DISPLAY_PREFIX_LENGTH: 12,
  NAME_MAX_LENGTH: 100,
  /** Entries in one scope. */
  MAX_SCOPE_ENTRIES: 200,
  /** `last_used_at` is written at most this often per token. */
  LAST_USED_WRITE_INTERVAL_MS: 60_000,
} as const;

/** Derived from the stored row; never stored. */
export const API_TOKEN_STATUSES = {
  ACTIVE: 'active',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
} as const;

export type ApiTokenStatus =
  (typeof API_TOKEN_STATUSES)[keyof typeof API_TOKEN_STATUSES];

/** Fields `api_token.updated` may name in `metadata.fields`. */
export const API_TOKEN_UPDATABLE_FIELDS = [
  'name',
  'scope',
  'expiresAt',
] as const;
