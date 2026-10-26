import type { PermissionAction } from './Access.constants';
import {
  CONTENT_WILDCARD_SUBJECT,
  READ_ONLY_ACTIONS,
} from './Access.constants';
import {
  type ActorContext,
  type ActorKind,
  isOwnerRole,
  type PermissionGrant,
  type TokenScope,
  type TokenScopeEntry,
} from './ActorContext.entity';
import { intersectFieldLists } from './FieldPaths.rules';

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
  const intersectedGrants: PermissionGrant[] = [];
  for (const entry of scope.permissions) {
    if (!isContentSubject(entry.subject)) continue;
    const sameAction = creatorGrants.filter(
      (grant) =>
        grant.action === entry.action && isContentSubject(grant.subject),
    );
    if (entry.subject === CONTENT_WILDCARD_SUBJECT) {
      for (const grant of sameAction) {
        intersectedGrants.push(intersectGrant(entry, grant, grant.subject));
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
      intersectedGrants.push(intersectGrant(entry, grant, entry.subject));
    }
  }
  return intersectedGrants;
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
