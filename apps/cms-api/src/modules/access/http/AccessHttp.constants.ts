import {
  ONE_HOUR_MS,
  RATE_LIMIT_KEY_SOURCES,
  type RateLimitRule,
} from '../../../common/constants/limits.constants';

export const ACCESS_RATE_LIMIT_POLICIES = {
  /**
   * `POST /accounts` and `POST /accounts/:id/invite/resend`: one
   * shared counter per caller and per IP, so invite and resend can't be used
   * to mail-bomb. In memory (one replica).
   */
  ACCOUNT_INVITE: [
    {
      name: 'account-invite:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 20,
      windowMs: ONE_HOUR_MS,
    },
    {
      name: 'account-invite:actor',
      keySource: RATE_LIMIT_KEY_SOURCES.ACTOR,
      maxHits: 10,
      windowMs: ONE_HOUR_MS,
    },
  ],
} as const satisfies Record<string, readonly RateLimitRule[]>;

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
