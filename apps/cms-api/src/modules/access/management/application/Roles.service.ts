import { Inject, Injectable } from '@nestjs/common';

import type { ClientMeta } from '../../../../common/types/ClientMeta.entity';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../../infrastructure/database/TransactionRunner.port';
import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditMetadata,
  auditActorOf,
  SecurityAuditService,
} from '../../../security-audit';
import { AccessPolicyService } from '../../application/AccessPolicy.service';
import { RolePermissionsService } from '../../application/RolePermissions.service';
import { VersionCache } from '../../application/VersionCache.service';
import type { PermissionAction } from '../../domain/Access.constants';
import {
  type PermissionGrant,
  rolePolicyFromRows,
} from '../../domain/ActorContext.entity';
import { validatePermissionSet } from '../../domain/PermissionSet.rules';
import {
  type AccountActor,
  assertOutranks,
  grantsBeyondActor,
  outranks,
} from '../../domain/Rank.rules';
import {
  MANAGEMENT_AUDIT_SUBJECTS,
  MANAGEMENT_LIMITS,
} from '../domain/AccessManagement.constants';
import {
  invalidIssues,
  permissionNotHeld,
  roleInUse,
  roleLimitReached,
  roleNotFound,
  roleSystemImmutable,
} from '../domain/AccessManagement.errors';
import {
  type RoleRecord,
  ROLE_REPOSITORY,
  type RoleRepository,
} from './AccessManagement.port';

/** `POST /roles` body, already validated. */
export interface RoleCreation {
  readonly slug: string;
  readonly name: string;
  readonly rank: number;
}

/** `PATCH /roles/:id` body, already validated. */
export interface RoleUpdate {
  readonly name?: string | undefined;
  readonly rank?: number | undefined;
}

/** A permission row as the API shows it (SPEC §8.1 `permissions`). */
export interface PermissionView {
  readonly subject: string;
  readonly action: PermissionAction;
  readonly readableFields: readonly string[] | null;
  readonly writableFields: readonly string[] | null;
  readonly conditions: unknown;
}

/** `GET /roles` item. */
export interface RoleView {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly rank: number;
  readonly isSystem: boolean;
  /** Accounts holding the role, deleted ones included (they block a delete). */
  readonly accountCount: number;
  /** Empty for `owner`: it holds everything without rows (SPEC §1). */
  readonly permissions: readonly PermissionView[];
  /** Whether the current actor may edit this role and its permissions (D6). */
  readonly manageable: boolean;
}

/**
 * Roles API (SPEC §9). Every write requires the actor to outrank the
 * role (and any new rank it sets, D6), so an admin can never touch `admin`
 * or `owner`. Writes bump `policy_version`, commit their audit row with them
 * (D15) and drop the role from the VersionCache after the commit. Permission
 * rows are written only through RolePermissionsService.
 */
@Injectable()
export class RolesService {
  constructor(
    @Inject(CORE_TRANSACTION_RUNNER) private readonly runner: TransactionRunner,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    private readonly access: AccessPolicyService,
    private readonly rolePermissions: RolePermissionsService,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
  ) {}

  /** Every role, highest rank first, with its permission rows. */
  async list(actor: AccountActor): Promise<RoleView[]> {
    const { roles, accountCounts } = await this.roles.listWithAccountCounts();
    return roles.map((row) =>
      this.view(actor, row, accountCounts.get(row.id) ?? 0),
    );
  }

  /** A custom role (rank 11–39) below the actor's rank, with no permissions. */
  async create(
    actor: AccountActor,
    input: RoleCreation,
    meta: ClientMeta,
  ): Promise<RoleView> {
    assertOutranks(actor, input.rank);
    const row = await this.runner.run(async (unit) => {
      // Serialised so two creates cannot both pass the cap.
      const customRoles = await this.roles.lockAndCountCustomRoles(unit);
      if (customRoles >= MANAGEMENT_LIMITS.MAX_CUSTOM_ROLES) {
        throw roleLimitReached();
      }
      const created = await this.roles.create(unit, {
        slug: input.slug,
        name: input.name,
        rank: input.rank,
        actorId: actor.accountId,
      });
      await this.record(unit, actor, created.documentId, meta, {
        action: AUDIT_ACTIONS.ROLE_CREATED,
        metadata: { slug: created.slug, rank: created.rank },
      });
      return created;
    });
    return this.view(actor, row, 0);
  }

  /** Name and/or rank. System roles keep their rank (409); slugs never change. */
  async update(
    actor: AccountActor,
    documentId: string,
    input: RoleUpdate,
    meta: ClientMeta,
  ): Promise<RoleView> {
    const row = await this.runner.run(async (unit) => {
      const role = await this.lockManageable(unit, actor, documentId);
      unit.afterCommit(() => this.versions.invalidateRole(role.id));
      if (input.rank !== undefined) {
        if (role.isSystem) throw roleSystemImmutable();
        assertOutranks(actor, input.rank);
      }
      const fields: string[] = [];
      if (input.name !== undefined && input.name !== role.name) {
        fields.push('name');
      }
      if (input.rank !== undefined && input.rank !== role.rank) {
        fields.push('rank');
      }
      if (fields.length === 0) return role;

      const updated = await this.roles.update(unit, role.id, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.rank === undefined ? {} : { rank: input.rank }),
        actorId: actor.accountId,
      });
      await this.record(unit, actor, updated.documentId, meta, {
        action: AUDIT_ACTIONS.ROLE_UPDATED,
        metadata: { fields },
      });
      return updated;
    });
    return this.view(actor, row, await this.roles.countAccounts(row.id));
  }

  /**
   * Deletes a custom role no account holds: 409 ROLE_IN_USE with
   * the count otherwise, deleted and disabled accounts included; 409
   * ROLE_SYSTEM_IMMUTABLE for a system role.
   */
  async remove(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    await this.runner.run(async (unit) => {
      const role = await this.lockManageable(unit, actor, documentId);
      if (role.isSystem) throw roleSystemImmutable();
      // The row lock above makes a concurrent assignment wait (FK key share).
      const accountCount = await this.roles.countAccounts(role.id, unit);
      if (accountCount > 0) throw roleInUse(accountCount);
      await this.roles.remove(unit, role.id);
      await this.record(unit, actor, role.documentId, meta, {
        action: AUDIT_ACTIONS.ROLE_DELETED,
        metadata: { slug: role.slug },
      });
      unit.afterCommit(() => this.versions.invalidateRole(role.id));
    });
  }

  /**
   * Replaces the role's permission set (§12-7, §12-11): validated with
   * `validatePermissionSet` (400 with every issue), never granting a system
   * subject action the actor lacks (403 PERMISSION_NOT_HELD), written by
   * RolePermissionsService with the audit row in its transaction.
   */
  async replacePermissions(
    actor: AccountActor,
    documentId: string,
    permissions: readonly unknown[],
    meta: ClientMeta,
  ): Promise<RoleView> {
    const role = await this.findRole(documentId);
    assertOutranks(actor, role.rank);

    const { catalog, evaluator } = await this.access.policy();
    const validated = validatePermissionSet(permissions, catalog);
    if (!validated.ok) throw invalidIssues(validated.issues);
    const grants: PermissionGrant[] = validated.value;
    const beyond = grantsBeyondActor(actor, grants, catalog, evaluator);
    if (beyond.length > 0) throw permissionNotHeld(beyond);

    await this.rolePermissions.replacePermissions(role.id, grants, {
      actorId: actor.accountId,
      alsoInTransaction: async (unit, policyVersion) => {
        // Re-checked under the lock: the rank may have changed meanwhile.
        const locked = await this.lockManageable(unit, actor, documentId);
        await this.record(unit, actor, locked.documentId, meta, {
          action: AUDIT_ACTIONS.ROLE_PERMISSIONS_REPLACED,
          metadata: {
            subjects: [...new Set(grants.map((grant) => grant.subject))],
            permissionCount: grants.length,
            policyVersion,
          },
        });
      },
    });
    const updated = await this.findRole(documentId);
    return this.view(
      actor,
      updated,
      await this.roles.countAccounts(updated.id),
    );
  }

  private async findRole(documentId: string): Promise<RoleRecord> {
    const role = await this.roles.findByDocumentId(documentId);
    if (role === null) throw roleNotFound();
    return role;
  }

  /** The role, row-locked for this transaction, if the actor outranks it. */
  private async lockManageable(
    unit: UnitOfWork,
    actor: AccountActor,
    documentId: string,
  ): Promise<RoleRecord> {
    const role = await this.roles.lockByDocumentId(unit, documentId);
    if (role === null) throw roleNotFound();
    assertOutranks(actor, role.rank);
    return role;
  }

  private record(
    unit: UnitOfWork,
    actor: AccountActor,
    targetId: string,
    meta: ClientMeta,
    event: { readonly action: AuditAction; readonly metadata: AuditMetadata },
  ): Promise<void> {
    return this.audit.record(unit, {
      actor: auditActorOf(actor),
      action: event.action,
      subject: MANAGEMENT_AUDIT_SUBJECTS.ROLES,
      targetId,
      metadata: event.metadata,
      ip: meta.ip,
    });
  }

  private view(
    actor: AccountActor,
    row: RoleRecord,
    accountCount: number,
  ): RoleView {
    const policy = rolePolicyFromRows(row, row.permissions);
    return {
      id: row.documentId,
      slug: row.slug,
      name: row.name,
      rank: row.rank,
      isSystem: row.isSystem,
      accountCount,
      permissions: policy.permissions.map((grant) => ({
        subject: grant.subject,
        action: grant.action,
        readableFields: grant.readableFields,
        writableFields: grant.writableFields,
        conditions: grant.conditions,
      })),
      manageable: outranks(actor, row.rank),
    };
  }
}
