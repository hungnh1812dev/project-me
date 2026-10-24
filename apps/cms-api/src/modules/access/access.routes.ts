/** SPEC §9 accounts. `:id` is the account's document_id. */
export const ACCOUNTS_ROUTES = {
  ROOT: 'accounts',
  BY_ID: ':id',
  DISABLE: ':id/disable',
  REVOKE_SESSIONS: ':id/sessions/revoke',
  ENABLE: ':id/enable',
  RESEND_INVITE: ':id/invite/resend',
} as const;

/** SPEC §9 roles. `:id` is the role's document_id. */
export const ROLES_ROUTES = {
  ROOT: 'roles',
  BY_ID: ':id',
  PERMISSIONS: ':id/permissions',
} as const;

/** SPEC §9 API tokens. `:id` is the token's document_id. */
export const API_TOKENS_ROUTES = {
  ROOT: 'api-tokens',
  BY_ID: ':id',
  REVOKE: ':id/revoke',
} as const;
