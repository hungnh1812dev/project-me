import type { UnitOfWork } from '../../../../infrastructure/database/TransactionRunner.port';
import type {
  StoredPermissionRow,
  StoredRole,
  TokenScope,
} from '../../domain/ActorContext.entity';
import type { AccountStatus } from '../../domain/Access.constants';
import type {
  AccountRecord,
  AccountRoleRecord,
} from '../domain/Account.entity';

/** Changes an account update writes; absent fields stay as they are. */
export interface AccountChange {
  readonly displayName?: string;
  readonly role?: { readonly id: number; readonly slug: string };
  readonly actorId: number;
}

export interface NewAccount {
  readonly email: string;
  readonly displayName: string;
  readonly role: { readonly id: number; readonly slug: string };
  readonly actorId: number;
}

/**
 * Accounts as the admin API reads and writes them. The `lock*` methods hold
 * their row for the rest of the unit, so the rank check and the write that
 * follow see the same row.
 */
export interface AccountAdminRepository {
  /** One page of accounts that are not deleted or reviewer accounts, oldest first. */
  listPage(
    page: number,
    pageSize: number,
  ): Promise<{ rows: AccountRecord[]; total: number }>;
  /** The account `FOR UPDATE`; null when unknown, deleted or a reviewer account. */
  lockManageable(
    unit: UnitOfWork,
    documentId: string,
  ): Promise<AccountRecord | null>;
  /** The role `FOR SHARE`, so its rank cannot change before the commit; null when unknown. */
  lockRoleForAssignment(
    unit: UnitOfWork,
    documentId: string,
  ): Promise<AccountRoleRecord | null>;
  isEmailTaken(unit: UnitOfWork, email: string): Promise<boolean>;
  /** @throws DomainError (conflict) when a concurrent insert won the unique email index. */
  create(unit: UnitOfWork, account: NewAccount): Promise<AccountRecord>;
  update(
    unit: UnitOfWork,
    accountId: number,
    change: AccountChange,
  ): Promise<AccountRecord>;
  setStatus(
    unit: UnitOfWork,
    accountId: number,
    status: AccountStatus,
    actorId: number,
  ): Promise<void>;
  hasPassword(unit: UnitOfWork, accountId: number): Promise<boolean>;
}
export const ACCOUNT_ADMIN_REPOSITORY = Symbol('ACCOUNT_ADMIN_REPOSITORY');

/** A role with its permission rows. */
export interface RoleRecord extends StoredRole {
  readonly documentId: string;
  readonly name: string;
  readonly permissions: readonly StoredPermissionRow[];
}

export interface NewRole {
  readonly slug: string;
  readonly name: string;
  readonly rank: number;
  readonly actorId: number;
}

export interface RoleChange {
  readonly name?: string;
  readonly rank?: number;
  readonly actorId: number;
}

export interface RoleRepository {
  /** Every role, highest rank first, with the number of accounts holding it. */
  listWithAccountCounts(): Promise<{
    roles: RoleRecord[];
    accountCounts: ReadonlyMap<number, number>;
  }>;
  findByDocumentId(documentId: string): Promise<RoleRecord | null>;
  /** The role `FOR UPDATE`; null when unknown. */
  lockByDocumentId(
    unit: UnitOfWork,
    documentId: string,
  ): Promise<RoleRecord | null>;
  /** Accounts holding the role, deleted and disabled ones included. */
  countAccounts(roleId: number, unit?: UnitOfWork): Promise<number>;
  /** Takes the custom-role creation lock for this unit and counts the custom roles. */
  lockAndCountCustomRoles(unit: UnitOfWork): Promise<number>;
  /** @throws DomainError (conflict) when the slug is taken. */
  create(unit: UnitOfWork, role: NewRole): Promise<RoleRecord>;
  /** Writes the changes and bumps `policy_version`. */
  update(
    unit: UnitOfWork,
    roleId: number,
    change: RoleChange,
  ): Promise<RoleRecord>;
  remove(unit: UnitOfWork, roleId: number): Promise<void>;
}
export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');

/** An API token row with its creator. Never the raw token or its hash. */
export interface ManagedApiToken {
  readonly id: number;
  readonly documentId: string;
  readonly name: string;
  readonly tokenPrefix: string;
  readonly scope: unknown;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly createdAt: Date;
  readonly createdById: number;
  readonly createdBy: {
    readonly documentId: string;
    readonly displayName: string;
    readonly roleId: number;
  };
}

export interface NewApiToken {
  readonly name: string;
  readonly tokenPrefix: string;
  readonly tokenHash: string;
  readonly scope: TokenScope;
  readonly expiresAt: Date | null;
  readonly creatorId: number;
}

export interface ApiTokenChange {
  readonly name?: string;
  readonly scope?: TokenScope;
  readonly expiresAt?: Date | null;
}

export interface ApiTokenAdminRepository {
  /** Newest first; `createdById` limits the page to one account's tokens. */
  listPage(
    createdById: number | undefined,
    page: number,
    pageSize: number,
  ): Promise<{ rows: ManagedApiToken[]; total: number }>;
  create(unit: UnitOfWork, token: NewApiToken): Promise<ManagedApiToken>;
  /** The token `FOR UPDATE`, whoever created it; null when unknown. */
  lockByDocumentId(
    unit: UnitOfWork,
    documentId: string,
  ): Promise<ManagedApiToken | null>;
  update(
    unit: UnitOfWork,
    tokenId: number,
    change: ApiTokenChange,
  ): Promise<ManagedApiToken>;
  markRevoked(
    unit: UnitOfWork,
    tokenId: number,
    revokedAt: Date,
  ): Promise<void>;
}
export const API_TOKEN_ADMIN_REPOSITORY = Symbol('API_TOKEN_ADMIN_REPOSITORY');
