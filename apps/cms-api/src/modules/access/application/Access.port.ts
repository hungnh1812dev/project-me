import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type { AccountStatus } from '../domain/Access.constants';
import type {
  PermissionGrant,
  RolePolicy,
} from '../domain/ActorContext.entity';

/** What the guard needs to know about an account on every request. */
export interface AccountVersions {
  id: number;
  documentId: string;
  tokenVersion: number;
  status: AccountStatus;
  isDeleted: boolean;
  roleId: number;
  /** The reviewer session of an ephemeral reviewer account (D2); null otherwise. */
  reviewerSessionId: number | null;
}

/** Reads the revocation versions of an account (D9). */
export interface AccountVersionSource {
  /** Account by `document_id` (the JWT `sub`); null if it does not exist. */
  findByDocumentId(documentId: string): Promise<AccountVersions | null>;
}
export const ACCOUNT_VERSION_SOURCE = Symbol('ACCOUNT_VERSION_SOURCE');

/** Reads roles. Shared with identity through the module facade (AUD-CA1b-10). */
export interface RoleLookup {
  /** A role with its permission rows; null if it does not exist. */
  findPolicy(roleId: number): Promise<RolePolicy | null>;
  findIdBySlug(slug: string): Promise<number | null>;
}
export const ROLE_LOOKUP = Symbol('ROLE_LOOKUP');

/** The `api_tokens` row as authentication reads it: never `token_hash`. */
export interface ApiTokenRecord {
  id: number;
  documentId: string;
  scope: unknown;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  creatorDocumentId: string;
}

export interface ApiTokenLookup {
  findByHash(tokenHash: string): Promise<ApiTokenRecord | null>;
  /** Writes `last_used_at` without moving the row's `updated_at`. */
  writeLastUsedAt(id: number, usedAt: Date): Promise<void>;
}
export const API_TOKEN_LOOKUP = Symbol('API_TOKEN_LOOKUP');

export interface PermissionRepository {
  /**
   * Replaces the role's whole permission set and bumps `roles.policy_version`
   * inside `unit`. Returns the new policy version.
   */
  replaceAll(
    unit: UnitOfWork,
    roleId: number,
    permissions: readonly PermissionGrant[],
    actorId: number | null,
  ): Promise<number>;
}
export const PERMISSION_REPOSITORY = Symbol('PERMISSION_REPOSITORY');
