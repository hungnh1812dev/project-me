import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaClient } from '../../../infrastructure/database/PrismaClient.adapter';
import { PrismaService } from '../../../infrastructure/database/Prisma.service';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type {
  DefaultPermissionSeed,
  PermissionRepository,
  RoleLookup,
  RoleSeedStore,
  SeededRoleRow,
  SystemRoleSeed,
} from '../application/Access.port';
import { RoleSeedService } from '../application/RoleSeed.service';
import {
  type PermissionGrant,
  type RolePolicy,
  rolePolicyFromRows,
} from '../domain/ActorContext.entity';

/** null -> SQL NULL (Prisma needs DbNull for nullable Json columns). */
function jsonOrDbNull(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : value;
}

/** Key for `pg_advisory_xact_lock`: serialises concurrent permission seeds. */
const ROLE_PERMISSIONS_SEED_LOCK_KEY = 7_163_201_908n;

/**
 * Roles and their permission rows: reads for the policy cache, the one write
 * path, and the seeds.
 */
@Injectable()
export class PrismaRolePolicyRepository
  implements RoleLookup, PermissionRepository, RoleSeedStore
{
  /** Typed as the client so the CLIs can build the adapter on a plain `PrismaClient`. */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  async findPolicy(roleId: number): Promise<RolePolicy | null> {
    const row = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: {
        id: true,
        slug: true,
        rank: true,
        isSystem: true,
        policyVersion: true,
        permissions: {
          select: {
            subject: true,
            action: true,
            readableFields: true,
            writableFields: true,
            conditions: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (row === null) return null;
    return rolePolicyFromRows(
      {
        id: row.id,
        slug: row.slug,
        rank: row.rank,
        isSystem: row.isSystem,
        policyVersion: row.policyVersion,
      },
      row.permissions,
    );
  }

  async findIdBySlug(slug: string): Promise<number | null> {
    const row = await this.prisma.role.findUnique({
      where: { slug },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async replaceAll(
    unit: UnitOfWork,
    roleId: number,
    permissions: readonly PermissionGrant[],
    actorId: number | null,
  ): Promise<number> {
    const tx = prismaTxOf(unit);
    await tx.permission.deleteMany({ where: { roleId } });
    if (permissions.length > 0) {
      await tx.permission.createMany({
        data: permissions.map((permission) => ({
          roleId,
          subject: permission.subject,
          action: permission.action,
          readableFields: jsonOrDbNull(permission.readableFields),
          writableFields: jsonOrDbNull(permission.writableFields),
          conditions: jsonOrDbNull(permission.conditions),
          createdById: actorId,
          updatedById: actorId,
        })),
      });
    }
    const role = await tx.role.update({
      where: { id: roleId },
      data: { policyVersion: { increment: 1 }, updatedById: actorId },
      select: { policyVersion: true },
    });
    return role.policyVersion;
  }

  findRolesBySlugs(slugs: readonly string[]): Promise<SeededRoleRow[]> {
    return this.prisma.role.findMany({
      where: { slug: { in: [...slugs] } },
      select: { slug: true, rank: true, isSystem: true },
    });
  }

  async insertMissingSystemRoles(
    roles: readonly SystemRoleSeed[],
  ): Promise<void> {
    await this.prisma.role.createMany({
      data: roles.map(({ slug, name, rank }) => ({
        slug,
        name,
        rank,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
  }

  seedPermissionsWhereMissing(
    defaults: Readonly<Record<string, readonly DefaultPermissionSeed[]>>,
  ): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      // Concurrent seeds queue here, so a role is never seeded twice.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLE_PERMISSIONS_SEED_LOCK_KEY})`;
      const roles = await tx.role.findMany({
        where: { slug: { in: Object.keys(defaults) }, isSystem: true },
        select: {
          id: true,
          slug: true,
          // One row is enough to know the role was already configured.
          permissions: { select: { id: true }, take: 1 },
        },
      });
      const seeded: string[] = [];
      for (const role of roles) {
        const rows = defaults[role.slug] ?? [];
        if (role.permissions.length > 0 || rows.length === 0) continue;
        await tx.permission.createMany({
          data: rows.flatMap(({ subject, actions }) =>
            actions.map((action) => ({ roleId: role.id, subject, action })),
          ),
        });
        seeded.push(role.slug);
      }
      return seeded;
    });
  }
}

/**
 * The role seeds on `prisma`, for the CLIs and specs that run without Nest.
 * The only way out of access for this adapter: the permission write path
 * stays inside the module.
 */
export function roleSeedServiceOf(prisma: PrismaClient): RoleSeedService {
  return new RoleSeedService(new PrismaRolePolicyRepository(prisma));
}
