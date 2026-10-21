import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { PermissionGrant } from './actor-context';
import { VersionCache } from './version-cache';

/** null -> SQL NULL (Prisma needs DbNull for nullable Json columns). */
function jsonOrDbNull(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : value;
}

export interface PermissionWriteOptions {
  /** Account making the change (`created_by` / `updated_by`). */
  actorId?: number | undefined;
  /**
   * Extra writes in the same transaction (T17: the D15 audit row). The
   * cache is dropped only after the whole transaction commits.
   */
  alsoInTransaction?:
    | ((tx: Prisma.TransactionClient, policyVersion: number) => Promise<void>)
    | undefined;
}

/**
 * The only write path for a role's permission rows (T15). It replaces the
 * whole set and bumps `roles.policy_version` in one transaction, then drops
 * the cached role, so the next request is evaluated with the new rows
 * (§12-11). Callers validate first (`validatePermissionSet`) and enforce the
 * rank rule (D6, T17); this service checks neither.
 */
@Injectable()
export class RolePermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: VersionCache,
  ) {}

  /** Returns the new policy version. */
  async replacePermissions(
    roleId: number,
    permissions: readonly PermissionGrant[],
    options: PermissionWriteOptions = {},
  ): Promise<number> {
    const write = async (tx: Prisma.TransactionClient): Promise<number> => {
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
            createdById: options.actorId ?? null,
            updatedById: options.actorId ?? null,
          })),
        });
      }
      const role = await tx.role.update({
        where: { id: roleId },
        data: {
          policyVersion: { increment: 1 },
          updatedById: options.actorId ?? null,
        },
        select: { policyVersion: true },
      });
      await options.alsoInTransaction?.(tx, role.policyVersion);
      return role.policyVersion;
    };

    const version = await this.prisma.$transaction(write);
    // After the commit: invalidating earlier would let a concurrent request
    // re-cache the old rows.
    this.versions.invalidateRole(roleId);
    return version;
  }
}
