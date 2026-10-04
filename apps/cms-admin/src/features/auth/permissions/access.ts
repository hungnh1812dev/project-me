import { can, checkPermissions, type PermissionMode } from './can';
import type { Actor, Decision, PolicyAttrs } from './policies';

/** What a route needs. Every given check must pass; none given means allowed. */
export interface AccessRequirements {
  /** RBAC slugs (all of them, or one with `mode: 'any'`). */
  permission?: string | readonly string[];
  mode?: PermissionMode;
  contentTypeSlug?: string;
  /** The lowest role level allowed. */
  minLevel?: number;
  /** An ABAC policy check: `{ I: action, a: subject, with: attrs }`. */
  can?: { I: string; a: string; with?: PolicyAttrs };
}

const ALLOWED: Decision = { allowed: true, reason: null };

/** Runs the permission, level and policy checks in that order; the first denial wins. */
export function checkAccess(actor: Actor, requirements: AccessRequirements): Decision {
  const { permission, mode, contentTypeSlug, minLevel, can: policy } = requirements;

  if (permission !== undefined) {
    const decision = checkPermissions(actor.permissions, permission, { mode, contentTypeSlug });
    if (!decision.allowed) return decision;
  }
  if (minLevel !== undefined && actor.level < minLevel) {
    return { allowed: false, reason: `Requires role level ${minLevel} or higher.` };
  }
  if (policy !== undefined) {
    const decision = can(actor, policy.I, policy.a, policy.with);
    if (!decision.allowed) return decision;
  }
  return ALLOWED;
}
