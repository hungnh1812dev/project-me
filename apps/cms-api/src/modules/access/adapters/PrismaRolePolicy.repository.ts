import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type {
  PermissionRepository,
  RoleLookup,
} from '../application/Access.port';
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

/** Roles and their permission rows: reads for the policy cache, the one write path. */
@Injectable()
export class PrismaRolePolicyRepository
  implements RoleLookup, PermissionRepository
{
  constructor(private readonly prisma: PrismaService) {}

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
}
