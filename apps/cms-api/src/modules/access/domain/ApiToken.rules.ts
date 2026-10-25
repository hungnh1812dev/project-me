/** API tokens (SPEC D5). */
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

/**
 * The one definition of "this API token is expired" (SPEC D5): the expiry
 * instant itself already counts as expired. Authentication, the list status
 * and the update guard all call this, so they agree to the millisecond.
 */
export function isApiTokenExpired(
  expiresAt: Date | null,
  nowMs: number,
): boolean {
  return expiresAt !== null && expiresAt.getTime() <= nowMs;
}
