import { isApiError } from '@/core/api/apiError';

/** What the delete-permission dialog shows for a P4 409 (AC-27). */
export interface PermissionConflictSummary {
  /** From the body, or `null` when the server sent no usable counts. */
  roleCount: number | null;
  accessTokenCount: number | null;
  /** The sentence to show: built from the counts, or the server message as a fallback. */
  text: string;
}

const FALLBACK =
  'This permission is still in use. Remove it from its roles and access tokens first.';

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const plural = (count: number, one: string, other: string) =>
  `${count} ${count === 1 ? one : other}`;

/**
 * Reads P4's 409 body `{ message, roleCount, accessTokenCount }` (AC-27). With both counts it
 * builds "This permission is still used by 2 roles and 1 access token. Remove it from them first.",
 * pluralized and leaving out a zero count. Without usable counts it falls back to the server
 * message. Returns `null` for anything that is not a 409 `ApiError`. Pure.
 */
export function parsePermissionConflict(error: unknown): PermissionConflictSummary | null {
  if (!isApiError(error) || error.status !== 409) return null;
  const body = (typeof error.body === 'object' && error.body !== null ? error.body : {}) as Record<
    string,
    unknown
  >;
  const { roleCount, accessTokenCount } = body;
  if (!isCount(roleCount) || !isCount(accessTokenCount) || roleCount + accessTokenCount === 0) {
    return { roleCount: null, accessTokenCount: null, text: error.message || FALLBACK };
  }
  const parts = [
    roleCount > 0 && plural(roleCount, 'role', 'roles'),
    accessTokenCount > 0 && plural(accessTokenCount, 'access token', 'access tokens'),
  ].filter(Boolean);
  return {
    roleCount,
    accessTokenCount,
    text: `This permission is still used by ${parts.join(' and ')}. Remove it from them first.`,
  };
}
