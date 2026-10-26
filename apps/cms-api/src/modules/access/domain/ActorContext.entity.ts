import { z } from 'zod';

import { DomainError } from '../../../common/errors/Domain.errors';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/DomainErrorKinds.constants';
import type { PermissionAction } from './Access.constants';
import { OWNER_ROLE_SLUG } from '../roles/system-roles';
import { PERMISSION_ACTIONS } from './Access.constants';
import type { FieldList } from './FieldPaths.rules';

/** The one bare 401 every failed authentication answers with, whatever the cause (N2c). */
export function unauthenticated(): DomainError {
  return new DomainError({ kind: DOMAIN_ERROR_KINDS.UNAUTHENTICATED });
}

/** One permission row in memory (SPEC §8.1 `permissions`). */
export interface PermissionGrant {
  subject: string;
  action: PermissionAction;
  readableFields: FieldList;
  writableFields: FieldList;
  /** Raw conditions DSL JSON (SPEC §8.3); compiled and re-validated on use. */
  conditions: unknown;
}

/** A role with its permission rows, as the evaluator needs it. */
export interface RolePolicy {
  id: number;
  slug: string;
  rank: number;
  isSystem: boolean;
  policyVersion: number;
  permissions: readonly PermissionGrant[];
}

/** `api_tokens.scope` (reused by API tokens). Content subjects only. */
export interface TokenScopeEntry {
  subject: string;
  action: PermissionAction;
  readableFields?: FieldList | undefined;
  writableFields?: FieldList | undefined;
}

export interface TokenScope {
  permissions: readonly TokenScopeEntry[];
}

/**
 * Who is asking. `role` is always the role whose permissions apply: the
 * account's own, the reviewer account's, or (for a token) the creator's
 * **current** role (D5). `accountId` feeds `$actor.id` in conditions.
 */
export type ActorContext =
  | { kind: 'account'; accountId: number; role: RolePolicy }
  | {
      kind: 'reviewer';
      /** The session's ephemeral `reviewer` account (D2). */
      accountId: number;
      sessionId: number;
      role: RolePolicy;
    }
  | {
      kind: 'api_token';
      tokenId: number;
      /** The creator; their current role is `role`. */
      accountId: number;
      role: RolePolicy;
      scope: TokenScope;
    }
  /** No credentials: reads through the `public` role (SPEC §1). */
  | { kind: 'anonymous'; role: RolePolicy };

export type ActorKind = ActorContext['kind'];

export class InvalidPolicyDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPolicyDataError';
  }
}

const fieldListSchema = z.array(z.string().min(1)).nullable();
const actionSchema = z.enum(PERMISSION_ACTIONS);

export const tokenScopeSchema = z.strictObject({
  permissions: z.array(
    z.strictObject({
      subject: z.string().min(1),
      action: actionSchema,
      readableFields: fieldListSchema.optional(),
      writableFields: fieldListSchema.optional(),
    }),
  ),
});

/** Shape check of a stored field list (jsonb). Invalid data fails closed. */
function parseFieldList(raw: unknown, what: string): FieldList {
  const parsed = fieldListSchema.safeParse(raw ?? null);
  if (!parsed.success) {
    throw new InvalidPolicyDataError(`${what} is not a field list.`);
  }
  return parsed.data;
}

export interface StoredPermissionRow {
  subject: string;
  action: PermissionAction;
  readableFields: unknown;
  writableFields: unknown;
  conditions: unknown;
}

export interface StoredRole {
  id: number;
  slug: string;
  rank: number;
  isSystem: boolean;
  policyVersion: number;
}

/**
 * Builds a `RolePolicy` from Prisma rows (jsonb arrives as `unknown`).
 * @throws InvalidPolicyDataError when a stored field list is malformed.
 */
export function rolePolicyFromRows(
  role: StoredRole,
  rows: readonly StoredPermissionRow[],
): RolePolicy {
  return {
    ...role,
    permissions: rows.map((row, index) => ({
      subject: row.subject,
      action: row.action,
      readableFields: parseFieldList(
        row.readableFields,
        `Permission ${index} readable_fields`,
      ),
      writableFields: parseFieldList(
        row.writableFields,
        `Permission ${index} writable_fields`,
      ),
      conditions: row.conditions ?? null,
    })),
  };
}

/**
 * Parses stored `api_tokens.scope`.
 * @throws InvalidPolicyDataError when it is not a scope.
 */
export function parseTokenScope(raw: unknown): TokenScope {
  const parsed = tokenScopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidPolicyDataError('api_tokens.scope is not a token scope.');
  }
  return parsed.data;
}

export function accountActor(
  accountId: number,
  role: RolePolicy,
): ActorContext {
  return { kind: 'account', accountId, role };
}

export function reviewerActor(
  accountId: number,
  sessionId: number,
  role: RolePolicy,
): ActorContext {
  return { kind: 'reviewer', accountId, sessionId, role };
}

export function apiTokenActor(
  tokenId: number,
  creatorId: number,
  creatorRole: RolePolicy,
  scope: TokenScope,
): ActorContext {
  return {
    kind: 'api_token',
    tokenId,
    accountId: creatorId,
    role: creatorRole,
    scope,
  };
}

export function anonymousActor(publicRole: RolePolicy): ActorContext {
  return { kind: 'anonymous', role: publicRole };
}

/** The Owner system role: every action on every known subject (SPEC §1). */
export function isOwnerRole(role: RolePolicy): boolean {
  return role.isSystem && role.slug === OWNER_ROLE_SLUG;
}
