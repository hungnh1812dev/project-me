import type { MeUser } from '../types';
import { hasPermission } from './permissions';
import { policies, type Actor, type Decision, type PolicyAttrs } from './policies';

const NO_PERMISSIONS: readonly string[] = Object.freeze([]);

/** Reduces the signed-in user (or nobody) to an `Actor`. No role means level 0, no permissions. */
export function toActor(user: MeUser | null): Actor {
  return {
    userId: user?.documentId ?? null,
    level: user?.role?.level ?? 0,
    permissions: user?.role?.permissions ?? NO_PERMISSIONS,
  };
}

/**
 * ABAC check, deny by default: an unknown subject or action is denied.
 * Client-side defense in depth only; the backend still enforces every rule.
 */
export function can(
  actor: Actor,
  action: string,
  subject: string,
  attrs: PolicyAttrs = {},
): Decision {
  if (!Object.hasOwn(policies, subject)) {
    return { allowed: false, reason: `Unknown subject "${subject}".` };
  }
  const actions = policies[subject];
  if (!Object.hasOwn(actions, action)) {
    return { allowed: false, reason: `Unknown action "${action}" on "${subject}".` };
  }
  return actions[action](actor, attrs);
}

export type PermissionMode = 'all' | 'any';

export interface PermissionOptions {
  /** `all` (default): every slug is required. `any`: one slug is enough. */
  mode?: PermissionMode;
  /** Scopes global `document:<action>` slugs to this content type. */
  contentTypeSlug?: string;
}

/** `document:<action>` → `document:<action>:<slug>`. Any other slug is returned unchanged. */
export function scopeToContentType(slug: string, contentTypeSlug: string | undefined): string {
  if (!contentTypeSlug) return slug;
  const parts = slug.split(':');
  return parts.length === 2 && parts[0] === 'document' ? `${slug}:${contentTypeSlug}` : slug;
}

/** RBAC check of one or more slugs, as a `Decision` with the reason for a denial. */
export function checkPermissions(
  granted: readonly string[],
  required: string | readonly string[],
  { mode = 'all', contentTypeSlug }: PermissionOptions = {},
): Decision {
  const slugs = (typeof required === 'string' ? [required] : required).map((slug) =>
    scopeToContentType(slug, contentTypeSlug),
  );

  if (mode === 'any') {
    if (slugs.some((slug) => hasPermission(granted, slug))) return { allowed: true, reason: null };
    const reason =
      slugs.length === 0
        ? 'No permission was required.'
        : `Requires one of the ${slugs.map((slug) => `"${slug}"`).join(', ')} permissions.`;
    return { allowed: false, reason };
  }

  const missing = slugs.find((slug) => !hasPermission(granted, slug));
  return missing === undefined
    ? { allowed: true, reason: null }
    : { allowed: false, reason: `Requires the "${missing}" permission.` };
}
