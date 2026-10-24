/** API token states and fields (SPEC D5). */
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
