import type { AxiosInstance } from 'axios';

import type {
  AccountStatus,
  PermissionAction,
} from '../../config/access.constants';
import type { TwoFactorMethod } from '../../config/auth.constants';
import { API_ENDPOINTS } from '../../config/endpoints';

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

/** A field of a content type (T17b). */
export interface ContentTypeField {
  path: string;
  type: string;
  system: boolean;
  component: boolean;
  repeatable: boolean;
  rootScalar: boolean;
  conditionKind: string | null;
  sensitive: boolean;
}

export interface ContentType {
  slug: string;
  kind: string;
  draftAndPublish: boolean;
  fields: ContentTypeField[];
}

interface ListBody<T> {
  data: T[];
}

/** Offset paging of `GET /accounts` (T17c). `total` counts every row. */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface AccountsPage {
  data: Account[];
  meta: PageMeta;
}

/** Accounts, roles and content-type discovery (T17, T17b). Bearer via the interceptor. */
export function createAccessApi(client: AxiosInstance) {
  const { ACCOUNTS, ROLES, CONTENT_TYPES } = API_ENDPOINTS;
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

    /** Sorted by slug. */
    listContentTypes: async (): Promise<ContentType[]> => {
      const { data } = await client.get<ListBody<ContentType>>(
        CONTENT_TYPES.LIST,
      );
      return data.data;
    },
  };
}

export type AccessApi = ReturnType<typeof createAccessApi>;
