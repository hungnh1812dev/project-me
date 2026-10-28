import type {
  PermissionAction,
  PrismaClient,
} from '../../src/generated/prisma/client';
import { roleSeedServiceOf } from '../../src/modules/access';
import type {
  PermissionGrant,
  RolePolicy,
} from '../../src/modules/access/domain/ActorContext.entity';
import { SubjectCatalog } from '../../src/modules/access/domain/SubjectCatalog.rules';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import {
  DEFAULT_ROLE_PERMISSIONS,
  type DefaultPermission,
  SYSTEM_ROLES,
  type SystemRoleSlug,
} from '../../src/modules/access/domain/SystemRoles.entity';

/** Two small content types: one with a nested component, one flat. */
export const ARTICLE_DEFINITION = {
  slug: 'article',
  kind: 'collection',
  draftAndPublish: true,
  fields: [
    { name: 'title', type: 'string' },
    { name: 'body', type: 'richtext' },
    { name: 'priority', type: 'integer' },
    { name: 'score', type: 'decimal' },
    { name: 'featured', type: 'boolean' },
    { name: 'releaseDate', type: 'date' },
    { name: 'releasedAt', type: 'datetime' },
    { name: 'meta', type: 'json' },
    {
      name: 'reference',
      type: 'component',
      fields: [
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string' },
      ],
    },
  ],
} as const;

export const NOTE_DEFINITION = {
  slug: 'note',
  kind: 'collection',
  draftAndPublish: false,
  fields: [{ name: 'text', type: 'text' }],
} as const;

export function testCatalog(): SubjectCatalog {
  return new SubjectCatalog(
    ContentTypeRegistry.fromDefinitions([ARTICLE_DEFINITION, NOTE_DEFINITION]),
  );
}

export function grant(
  subject: string,
  action: PermissionAction,
  extra: Partial<PermissionGrant> = {},
): PermissionGrant {
  return {
    subject,
    action,
    readableFields: null,
    writableFields: null,
    conditions: null,
    ...extra,
  };
}

function expand(defaults: readonly DefaultPermission[]): PermissionGrant[] {
  return defaults.flatMap(({ subject, actions }) =>
    actions.map((action) => grant(subject, action)),
  );
}

/** A system role carrying its seeded default rows, or `permissions` when given. */
export function systemRole(
  slug: SystemRoleSlug,
  permissions?: PermissionGrant[],
): RolePolicy {
  const index = SYSTEM_ROLES.findIndex((role) => role.slug === slug);
  const role = SYSTEM_ROLES[index];
  if (role === undefined) throw new Error(`no system role ${slug}`);
  return {
    id: index + 1,
    slug,
    rank: role.rank,
    isSystem: true,
    policyVersion: 1,
    permissions: permissions ?? expand(DEFAULT_ROLE_PERMISSIONS[slug]),
  };
}

export function customRole(
  rank: number,
  permissions: PermissionGrant[],
): RolePolicy {
  return {
    id: 100 + rank,
    slug: `custom-${rank}`,
    rank,
    isSystem: false,
    policyVersion: 1,
    permissions,
  };
}

/** The `db:seed` steps on a test database; each returns the slugs it wrote. */
export const seedSystemRoles = (prisma: PrismaClient): Promise<string[]> =>
  roleSeedServiceOf(prisma).seedSystemRoles();

export const seedRolePermissions = (prisma: PrismaClient): Promise<string[]> =>
  roleSeedServiceOf(prisma).seedRolePermissions();
