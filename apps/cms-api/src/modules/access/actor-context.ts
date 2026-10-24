import { z } from 'zod';

import type { PermissionAction } from '../../generated/prisma/client';
import { OWNER_ROLE_SLUG } from './roles/system-roles';
import {
  CONTENT_WILDCARD_SUBJECT,
  PERMISSION_ACTIONS,
  READ_ONLY_ACTIONS,
} from './access.constants';
import { type FieldList, intersectFieldLists } from './field-paths';

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

/**
 * What the actor's permissions boil down to before subjects are resolved.
 * `full` = owner short-circuit; `contentOnly` = system subjects denied;
 * `readOnly` = write actions denied and drafts never visible.
 */
export interface EffectivePolicy {
  full: boolean;
  contentOnly: boolean;
  readOnly: boolean;
  grants: readonly PermissionGrant[];
}

function scopeEntryAsGrant(entry: TokenScopeEntry): PermissionGrant {
  return {
    subject: entry.subject,
    action: entry.action,
    readableFields: entry.readableFields ?? null,
    writableFields: entry.writableFields ?? null,
    conditions: null,
  };
}

function intersectGrant(
  entry: TokenScopeEntry,
  creatorGrant: PermissionGrant,
  subject: string,
): PermissionGrant {
  return {
    subject,
    action: entry.action,
    readableFields: intersectFieldLists(
      entry.readableFields ?? null,
      creatorGrant.readableFields,
    ),
    writableFields: intersectFieldLists(
      entry.writableFields ?? null,
      creatorGrant.writableFields,
    ),
    // The creator's row conditions always apply; tokens have none.
    conditions: creatorGrant.conditions,
  };
}

/**
 * D5: token scope ∩ the creator's current permissions, content subjects
 * only. A scope entry for a specific slug meets the creator's rows for that
 * slug, or their `*` rows when they have none for it (the same override
 * rule the evaluator uses). A `*` entry meets every creator content row.
 */
export function intersectTokenScope(
  scope: TokenScope,
  creatorGrants: readonly PermissionGrant[],
  isContentSubject: (subject: string) => boolean,
): PermissionGrant[] {
  const result: PermissionGrant[] = [];
  for (const entry of scope.permissions) {
    if (!isContentSubject(entry.subject)) continue;
    const sameAction = creatorGrants.filter(
      (grant) =>
        grant.action === entry.action && isContentSubject(grant.subject),
    );
    if (entry.subject === CONTENT_WILDCARD_SUBJECT) {
      for (const grant of sameAction) {
        result.push(intersectGrant(entry, grant, grant.subject));
      }
      continue;
    }
    const specific = sameAction.filter(
      (grant) => grant.subject === entry.subject,
    );
    const matching =
      specific.length > 0
        ? specific
        : sameAction.filter(
            (grant) => grant.subject === CONTENT_WILDCARD_SUBJECT,
          );
    for (const grant of matching) {
      result.push(intersectGrant(entry, grant, entry.subject));
    }
  }
  return result;
}

type PolicyResolver<A extends ActorContext> = (
  actor: A,
  isContentSubject: (subject: string) => boolean,
) => EffectivePolicy;

function readOnlyPolicy(actor: ActorContext): EffectivePolicy {
  // D2 / SPEC §1: read only, published only, whatever the role rows say.
  return {
    full: false,
    contentOnly: false,
    readOnly: true,
    grants: actor.role.permissions.filter((grant) =>
      (READ_ONLY_ACTIONS as readonly PermissionAction[]).includes(grant.action),
    ),
  };
}

/** One resolver per actor kind, no default: a new kind fails to compile until it has one. */
const POLICY_RESOLVERS: {
  [K in ActorKind]: PolicyResolver<Extract<ActorContext, { kind: K }>>;
} = {
  account: (actor) => {
    const owner = isOwnerRole(actor.role);
    return {
      full: owner,
      contentOnly: false,
      readOnly: false,
      grants: owner ? [] : actor.role.permissions,
    };
  },
  api_token: (actor, isContentSubject) => {
    const scopeGrants = isOwnerRole(actor.role)
      ? actor.scope.permissions
          .filter((entry) => isContentSubject(entry.subject))
          .map(scopeEntryAsGrant)
      : intersectTokenScope(
          actor.scope,
          actor.role.permissions,
          isContentSubject,
        );
    return {
      full: false,
      contentOnly: true,
      readOnly: false,
      grants: scopeGrants,
    };
  },
  reviewer: readOnlyPolicy,
  anonymous: readOnlyPolicy,
};

/**
 * Resolves the actor to the grants that apply. `isContentSubject` says
 * whether a subject is `*` or a registered content type.
 */
export function effectivePolicy(
  actor: ActorContext,
  isContentSubject: (subject: string) => boolean,
): EffectivePolicy {
  const resolve = POLICY_RESOLVERS[actor.kind] as PolicyResolver<ActorContext>;
  return resolve(actor, isContentSubject);
}
