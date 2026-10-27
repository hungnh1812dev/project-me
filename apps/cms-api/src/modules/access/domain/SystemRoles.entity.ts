import {
  CONTENT_WILDCARD_SUBJECT,
  PERMISSION_ACTIONS,
  PermissionAction,
  SYSTEM_SUBJECT_ACTIONS,
} from './Access.constants';

export interface DefaultPermission {
  subject: string;
  actions: readonly PermissionAction[];
}

interface SystemRoleDefinition {
  slug: string;
  name: string;
  rank: number;
  /**
   * False for roles never given to an invited account: `public` is the
   * anonymous visitor and `reviewer` belongs to ephemeral reviewer sessions
   * (D2). `owner` is out of reach anyway (no rank is above it, D6).
   */
  assignable: boolean;
  /**
   * Rows seeded only into a role that has none yet. `owner`
   * needs none: the evaluator grants it everything on known subjects. Fields
   * are all (null) and there are no conditions.
   */
  defaultPermissions: readonly DefaultPermission[];
}

/**
 * The one table of system roles (SPEC §6). Slug and rank are immutable; the
 * migration pins the same pairs in a CHECK constraint and a trigger, so keep
 * both in sync.
 */
export const SYSTEM_ROLES = [
  {
    slug: 'public',
    name: 'Public',
    rank: 0,
    assignable: false,
    defaultPermissions: [
      { subject: CONTENT_WILDCARD_SUBJECT, actions: [PermissionAction.read] },
    ],
  },
  {
    slug: 'guest',
    name: 'Guest',
    rank: 10,
    assignable: true,
    defaultPermissions: [],
  },
  {
    slug: 'reviewer',
    name: 'Reviewer',
    rank: 20,
    assignable: false,
    defaultPermissions: [
      { subject: CONTENT_WILDCARD_SUBJECT, actions: [PermissionAction.read] },
      { subject: 'media', actions: [PermissionAction.read] },
    ],
  },
  {
    slug: 'editor',
    name: 'Editor',
    rank: 30,
    assignable: true,
    defaultPermissions: [
      {
        subject: CONTENT_WILDCARD_SUBJECT,
        actions: [
          PermissionAction.read,
          PermissionAction.create,
          PermissionAction.update,
          PermissionAction.publish,
          PermissionAction.unpublish,
        ],
      },
      {
        subject: 'media',
        actions: [
          PermissionAction.read,
          PermissionAction.create,
          PermissionAction.update,
        ],
      },
    ],
  },
  {
    slug: 'admin',
    name: 'Admin',
    rank: 40,
    assignable: true,
    defaultPermissions: [
      { subject: CONTENT_WILDCARD_SUBJECT, actions: PERMISSION_ACTIONS },
      { subject: 'accounts', actions: SYSTEM_SUBJECT_ACTIONS.accounts },
      { subject: 'roles', actions: SYSTEM_SUBJECT_ACTIONS.roles },
      { subject: 'api_tokens', actions: SYSTEM_SUBJECT_ACTIONS.api_tokens },
      { subject: 'media', actions: SYSTEM_SUBJECT_ACTIONS.media },
    ],
  },
  {
    slug: 'owner',
    name: 'Owner',
    rank: 100,
    assignable: true,
    defaultPermissions: [],
  },
] as const satisfies readonly SystemRoleDefinition[];

export type SystemRoleSlug = (typeof SYSTEM_ROLES)[number]['slug'];

export const OWNER_ROLE_SLUG = 'owner' satisfies SystemRoleSlug;

export const ADMIN_ROLE_SLUG = 'admin' satisfies SystemRoleSlug;

export const GUEST_ROLE_SLUG = 'guest' satisfies SystemRoleSlug;

/** The role of ephemeral reviewer accounts (D2). */
export const REVIEWER_ROLE_SLUG = 'reviewer' satisfies SystemRoleSlug;

/** The role of requests without credentials (SPEC §1). */
export const PUBLIC_ROLE_SLUG = 'public' satisfies SystemRoleSlug;

/**
 * System roles whose wildcard `*` content grant does not cover fields marked
 * `sensitive` (SPEC D2). A type-specific grant for the role decides alone,
 * so the Owner can unmask a field in the role editor.
 */
export const SENSITIVE_MASKED_ROLE_SLUGS: readonly SystemRoleSlug[] = [
  PUBLIC_ROLE_SLUG,
  REVIEWER_ROLE_SLUG,
];

/** System roles an invited account may never hold. */
export const UNASSIGNABLE_ROLE_SLUGS: readonly SystemRoleSlug[] =
  SYSTEM_ROLES.filter((role) => !role.assignable).map((role) => role.slug);

/** Default rows per system role, seeded by `seedRolePermissions`. */
export const DEFAULT_ROLE_PERMISSIONS = Object.fromEntries(
  SYSTEM_ROLES.map((role) => [role.slug, role.defaultPermissions]),
) as unknown as Readonly<Record<SystemRoleSlug, readonly DefaultPermission[]>>;

/** SPEC §6: rank range for custom roles. */
export const CUSTOM_ROLE_RANK = { min: 11, max: 39 } as const;

/** Shape of a role slug, system or custom (kebab-case, starts with a letter). */
export const ROLE_SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
