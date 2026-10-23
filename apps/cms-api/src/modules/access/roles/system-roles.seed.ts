import type { PrismaClient } from '../../../generated/prisma/client';
import { SYSTEM_ROLES } from './system-roles';

export class SystemRoleSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemRoleSeedError';
  }
}

/**
 * Inserts the missing system roles and never updates existing ones, so names
 * edited by the Owner survive. Idempotent. Fails if a role with a system slug
 * exists but is not that system role (e.g. a custom role took the slug).
 * Returns the slugs it inserted.
 */
export async function seedSystemRoles(prisma: PrismaClient): Promise<string[]> {
  const slugs = SYSTEM_ROLES.map((role) => role.slug);
  const before = new Set(
    (
      await prisma.role.findMany({
        where: { slug: { in: slugs } },
        select: { slug: true },
      })
    ).map((role) => role.slug),
  );

  await prisma.role.createMany({
    data: SYSTEM_ROLES.map(({ slug, name, rank }) => ({
      slug,
      name,
      rank,
      isSystem: true,
    })),
    skipDuplicates: true,
  });

  const rows = await prisma.role.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, rank: true, isSystem: true },
  });
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  for (const expected of SYSTEM_ROLES) {
    const row = bySlug.get(expected.slug);
    if (row?.isSystem !== true || row.rank !== expected.rank) {
      throw new SystemRoleSeedError(
        `Role "${expected.slug}" exists but is not the system role (rank ${expected.rank}).`,
      );
    }
  }
  return slugs.filter((slug) => !before.has(slug));
}
