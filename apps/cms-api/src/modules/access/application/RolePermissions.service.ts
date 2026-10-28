import { Inject, Injectable } from '@nestjs/common';

import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import type { PermissionGrant } from '../domain/ActorContext.entity';
import {
  PERMISSION_REPOSITORY,
  type PermissionRepository,
} from './Access.port';
import { VersionCache } from './VersionCache.service';

export interface PermissionWriteOptions {
  /** Account making the change (`created_by` / `updated_by`). */
  actorId?: number | undefined;
  /**
   * Extra writes in the same transaction (the D15 audit row). The
   * cache is dropped only after the whole transaction commits.
   */
  alsoInTransaction?:
    ((unit: UnitOfWork, policyVersion: number) => Promise<void>) | undefined;
}

/**
 * The only write path for a role's permission rows. It replaces the
 * whole set and bumps `roles.policy_version` in one transaction, then drops
 * the cached role, so the next request is evaluated with the new rows
 * (§12-11). Callers validate first (`validatePermissionSet`) and enforce the
 * rank rule (D6); this service checks neither.
 */
@Injectable()
export class RolePermissionsService {
  constructor(
    @Inject(CORE_TRANSACTION_RUNNER) private readonly runner: TransactionRunner,
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissions: PermissionRepository,
    private readonly versions: VersionCache,
  ) {}

  /** Returns the new policy version. */
  replacePermissions(
    roleId: number,
    permissions: readonly PermissionGrant[],
    options: PermissionWriteOptions = {},
  ): Promise<number> {
    return this.runner.run(async (unit) => {
      const policyVersion = await this.permissions.replaceAll(
        unit,
        roleId,
        permissions,
        options.actorId ?? null,
      );
      await options.alsoInTransaction?.(unit, policyVersion);
      // After the commit: invalidating earlier would let a concurrent request
      // re-cache the old rows.
      unit.afterCommit(() => this.versions.invalidateRole(roleId));
      return policyVersion;
    });
  }
}
