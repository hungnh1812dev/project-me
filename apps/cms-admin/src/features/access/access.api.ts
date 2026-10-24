import type { AxiosInstance } from 'axios';

import type {
  AccountStatus,
  ApiTokenStatus,
  PermissionAction,
} from '../../config/access.constants';
import type { TwoFactorMethod } from '../../config/auth.constants';
import { API_ENDPOINTS } from '../../config/endpoints';
import type { PageMeta } from '../../lib/api-types';
import { getContentTypes } from '../content-types';

/** `null` = every field; otherwise API field paths (`reference.phone`). */
export type FieldList = readonly string[] | null;

/** A permission row as `GET /roles` shows it and `PUT .../permissions` takes it. */
export interface PermissionRow {
  subject: string;
  action: PermissionAction;
  readableFields: FieldList;
  writableFields: FieldList;
  /** Conditions DSL (`{ all: [...] }`) or null; validated by the server. */
  conditions: unknown;
}

export interface RoleSummary {
  id: string;
  slug: string;
  name: string;
  rank: number;
}

export interface Account {
  id: string;
  email: string;
  displayName: string;
  status: AccountStatus;
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod | null;
  role: RoleSummary;
  createdAt: string;
  /** Whether the caller may change this account (rank rule D6). */
  manageable: boolean;
}

export interface Role extends RoleSummary {
  isSystem: boolean;
  accountCount: number;
  /** Empty for `owner`: it holds everything without rows. */
  permissions: PermissionRow[];
  /** Whether the caller may edit this role and its permissions (D6). */
  manageable: boolean;
}

export interface InviteAccountInput {
  email: string;
  displayName: string;
  roleId: string;
}

export type InvitedAccount = Account & { invitationSent: boolean };

/** One entry of a token scope; a missing field list means all fields. */
export interface TokenScopeEntry {
  subject: string;
  action: PermissionAction;
  readableFields?: readonly string[] | null;
  writableFields?: readonly string[] | null;
}

export interface ApiToken {
  id: string;
  name: string;
  /** First characters of the token, to tell tokens apart. Never the secret. */
  tokenPrefix: string;
  scope: { permissions: TokenScopeEntry[] };
  status: ApiTokenStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: { id: string; displayName: string };
}

/** The create answer is the only place the raw token ever appears. */
export type CreatedApiToken = ApiToken & { token: string };

export interface CreateApiTokenInput {
  name: string;
  scope: { permissions: readonly TokenScopeEntry[] };
  /** ISO 8601 with an offset. */
  expiresAt?: string;
}

export interface UpdateApiTokenInput {
  name?: string;
  scope?: { permissions: readonly TokenScopeEntry[] };
  /** `null` removes the expiry. */
  expiresAt?: string | null;
}

export interface ApiTokensPage {
  data: ApiToken[];
  meta: PageMeta;
}

interface ListBody<T> {
  data: T[];
}

export interface AccountsPage {
  data: Account[];
  meta: PageMeta;
}

/** Accounts, roles and content-type discovery (T17, T17b). Bearer via the interceptor. */
export function createAccessApi(client: AxiosInstance) {
  const { ACCOUNTS, ROLES, API_TOKENS } = API_ENDPOINTS;
  return {
    listAccounts: async (
      page: number,
      pageSize: number,
    ): Promise<AccountsPage> => {
      const { data } = await client.get<AccountsPage>(ACCOUNTS.LIST, {
        params: { page, pageSize },
      });
      return data;
    },

    inviteAccount: async (
      input: InviteAccountInput,
    ): Promise<InvitedAccount> => {
      const { data } = await client.post<InvitedAccount>(ACCOUNTS.LIST, input);
      return data;
    },

    /** 204; bumps the token version and ends every session of the account. */
    disableAccount: async (id: string): Promise<void> => {
      await client.post(ACCOUNTS.DISABLE(id));
    },

    /** 204; a disabled account becomes active (or invited without a password). */
    enableAccount: async (id: string): Promise<void> => {
      await client.post(ACCOUNTS.ENABLE(id));
    },

    /** Issues and mails a new invite code; `invitationSent: false` = mail failed. */
    resendInvite: async (id: string): Promise<{ invitationSent: boolean }> => {
      const { data } = await client.post<{ invitationSent: boolean }>(
        ACCOUNTS.RESEND_INVITE(id),
      );
      return data;
    },

    /** Rank descending. */
    listRoles: async (): Promise<Role[]> => {
      const { data } = await client.get<ListBody<Role>>(ROLES.LIST);
      return data.data;
    },

    replacePermissions: async (
      roleId: string,
      permissions: readonly PermissionRow[],
    ): Promise<Role> => {
      const { data } = await client.put<Role>(ROLES.PERMISSIONS(roleId), {
        permissions,
      });
      return data;
    },

    listApiTokens: async (
      page: number,
      pageSize: number,
    ): Promise<ApiTokensPage> => {
      const { data } = await client.get<ApiTokensPage>(API_TOKENS.LIST, {
        params: { page, pageSize },
      });
      return data;
    },

    /** The answer holds the raw token; keep it out of any cache. */
    createApiToken: async (
      input: CreateApiTokenInput,
    ): Promise<CreatedApiToken> => {
      const { data } = await client.post<CreatedApiToken>(
        API_TOKENS.LIST,
        input,
      );
      return data;
    },

    updateApiToken: async (
      id: string,
      input: UpdateApiTokenInput,
    ): Promise<ApiToken> => {
      const { data } = await client.patch<ApiToken>(API_TOKENS.ONE(id), input);
      return data;
    },

    /** 204; the token answers 401 from the next request on. */
    revokeApiToken: async (id: string): Promise<void> => {
      await client.post(API_TOKENS.REVOKE(id));
    },

    /** Sorted by slug. */
    listContentTypes: () => getContentTypes(client),
  };
}

export type AccessApi = ReturnType<typeof createAccessApi>;
