import { hasPermission } from './permissions';

/** Who is asking: the signed-in user reduced to what the policies need. */
export interface Actor {
  userId: string | null;
  /** The role level, 0 when there is no role. */
  level: number;
  permissions: readonly string[];
}

/** The outcome of a policy check. `reason` explains a denial and is `null` when allowed. */
export interface Decision {
  allowed: boolean;
  reason: string | null;
}

/** Attributes of the resource being acted on. Each subject reads only the fields it needs. */
export interface PolicyAttrs {
  /** `document`: scope the check to this content type. */
  contentTypeSlug?: string;
  /** `document`: `false` denies publish and unpublish. */
  draftToPublish?: boolean;
  /** `user`: the record being acted on. */
  targetUserId?: string;
  /** `user`: the target's role level. Unknown counts as not lower than the actor's. */
  targetLevel?: number;
  /** `user` `assign_role`: the level of the role being assigned. */
  newRoleLevel?: number;
  /** `role`: the role is a seeded default role. */
  isDefault?: boolean;
  /** `role` `update`: the fields being changed. */
  fields?: readonly string[];
}

export type Policy = (actor: Actor, attrs: PolicyAttrs) => Decision;

const ALLOW: Decision = Object.freeze({ allowed: true, reason: null });

const deny = (reason: string): Decision => ({ allowed: false, reason });

const check = (actor: Actor, slug: string): Decision =>
  hasPermission(actor.permissions, slug) ? ALLOW : deny(`Requires the "${slug}" permission.`);

/** A policy that only needs one permission slug. */
const requires =
  (slug: string): Policy =>
  (actor) =>
    check(actor, slug);

const isSelf = (actor: Actor, attrs: PolicyAttrs): boolean =>
  !!actor.userId && attrs.targetUserId === actor.userId;

/** The actor outranks the target. An unknown target level is denied. */
const outranksTarget = (actor: Actor, attrs: PolicyAttrs): boolean =>
  attrs.targetLevel !== undefined && actor.level > attrs.targetLevel;

const NOT_HIGHER = 'Requires a higher role level than the target user.';

/** `read` → `<res>:read`, every write action → `<res>:manager`. */
function resourcePolicies(resource: string): Record<string, Policy> {
  const manager = requires(`${resource}:manager`);
  return {
    read: requires(`${resource}:read`),
    create: manager,
    update: manager,
    delete: manager,
    revoke: manager,
    upload: manager,
  };
}

function documentPolicy(action: string): Policy {
  return (actor, attrs) => {
    const slug = attrs.contentTypeSlug
      ? `document:${action}:${attrs.contentTypeSlug}`
      : `document:${action}`;
    const decision = check(actor, slug);
    if (!decision.allowed) return decision;
    if ((action === 'publish' || action === 'unpublish') && attrs.draftToPublish === false) {
      return deny('This content type does not use draft and publish.');
    }
    return ALLOW;
  };
}

/**
 * The ABAC policy table: `subject → action → policy`. Anything not listed is denied.
 * Later phases add subjects or actions here; the engine (`can`) does not change.
 */
export const policies: Record<string, Record<string, Policy>> = {
  document: {
    read: documentPolicy('read'),
    create: documentPolicy('create'),
    update: documentPolicy('update'),
    delete: documentPolicy('delete'),
    publish: documentPolicy('publish'),
    unpublish: documentPolicy('unpublish'),
  },
  content_type: {
    read: requires('content_type:read'),
    configure: requires('content_type:manager'),
  },
  user: {
    read: requires('user:read'),
    update: (actor, attrs) => {
      if (isSelf(actor, attrs)) return ALLOW;
      const decision = check(actor, 'user:manager');
      if (!decision.allowed) return decision;
      return outranksTarget(actor, attrs) ? ALLOW : deny(NOT_HIGHER);
    },
    delete: (actor, attrs) => {
      const decision = check(actor, 'user:manager');
      if (!decision.allowed) return decision;
      if (isSelf(actor, attrs)) return deny('You cannot delete your own account.');
      return outranksTarget(actor, attrs) ? ALLOW : deny(NOT_HIGHER);
    },
    assign_role: (actor, attrs) => {
      const decision = check(actor, 'user:role_manager');
      if (!decision.allowed) return decision;
      if (isSelf(actor, attrs)) return deny('You cannot change your own role.');
      if (!outranksTarget(actor, attrs)) return deny(NOT_HIGHER);
      if (attrs.newRoleLevel === undefined || attrs.newRoleLevel >= actor.level) {
        return deny('The new role level must be lower than your own.');
      }
      return ALLOW;
    },
  },
  role: {
    read: requires('role:read'),
    create: requires('role:manager'),
    update: (actor, attrs) => {
      const decision = check(actor, 'role:manager');
      if (!decision.allowed) return decision;
      const fields = attrs.fields ?? [];
      if (attrs.isDefault && (fields.includes('name') || fields.includes('level'))) {
        return deny('The name and level of a default role cannot be changed.');
      }
      return ALLOW;
    },
    delete: (actor, attrs) => {
      const decision = check(actor, 'role:manager');
      if (!decision.allowed) return decision;
      return attrs.isDefault ? deny('A default role cannot be deleted.') : ALLOW;
    },
  },
  permission: resourcePolicies('permission'),
  api_token: resourcePolicies('api_token'),
  media: resourcePolicies('media'),
};
