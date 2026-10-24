import type { PrismaClient } from '../../../generated/prisma/client';
import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } from './system-roles';

/** Key for `pg_advisory_xact_lock`: serialises concurrent permission seeds. */
const ROLE_PERMISSIONS_SEED_LOCK_KEY = 7_163_201_908n;

/**
 * Seeds the default permission rows into each system role
 * that has none yet, so the Owner's later edits are never overwritten.
 * Idempotent; run after `seedSystemRoles`. Returns the slugs it seeded.
 */
export async function seedRolePermissions(
  prisma: PrismaClient,
): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    // Concurrent seeds queue here, so a role is never seeded twice.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLE_PERMISSIONS_SEED_LOCK_KEY})`;
    const roles = await tx.role.findMany({
      where: {
        slug: { in: SYSTEM_ROLES.map((role) => role.slug) },
        isSystem: true,
      },
      select: {
        id: true,
        slug: true,
        // One row is enough to know the role was already configured.
        permissions: { select: { id: true }, take: 1 },
      },
    });
    const seeded: string[] = [];
    for (const role of roles) {
      const defaults =
        DEFAULT_ROLE_PERMISSIONS[
          role.slug as keyof typeof DEFAULT_ROLE_PERMISSIONS
        ];
      if (role.permissions.length > 0 || defaults.length === 0) continue;
      await tx.permission.createMany({
        data: defaults.flatMap(({ subject, actions }) =>
          actions.map((action) => ({ roleId: role.id, subject, action })),
        ),
      });
      seeded.push(role.slug);
    }
    return seeded;
  });
}
