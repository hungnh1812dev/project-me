import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  type PermissionAction,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { ClientMeta } from '../../../common/http/client-meta';
import { AccessPolicyService } from '../access-policy.service';
import {
  MANAGEMENT_ERROR_CODES,
  MANAGEMENT_ERROR_MESSAGES,
  MANAGEMENT_LIMITS,
} from './access-management.constants';
import type {
  CreateRoleRequest,
  UpdateRoleRequest,
} from './access-management.requests';
import { type PermissionGrant, rolePolicyFromRows } from '../actor-context';
import { validatePermissionSet } from '../permission.validator';
import {
  type AccountActor,
  assertOutranks,
  grantsBeyondActor,
  outranks,
} from '../rank-rules';
import { RolePermissionsService } from '../role-permissions.service';
import {
  AUDIT_ACTIONS,
  type AuditAction,
} from '../../security-audit/security-audit.constants';
import {
  type AuditMetadata,
  auditActorOf,
  SecurityAuditService,
} from '../../security-audit/security-audit.service';
import { VersionCache } from '../version-cache';

type Tx = Prisma.TransactionClient;

const ROLES_SUBJECT = 'roles';
/** Advisory-lock key serialising custom role creation (the 50-role cap). */
const ROLE_CAP_LOCK = 1_700_017_003;
/** Postgres unique violation, as Prisma reports it. */
const UNIQUE_VIOLATION = 'P2002';

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

const ROLE_SELECT = {
  id: true,
  documentId: true,
  slug: true,
  name: true,
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
} as const;

type RoleRow = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>;

function roleNotFound(): NotFoundException {
  return new NotFoundException({
    errorCode: MANAGEMENT_ERROR_CODES.ROLE_NOT_FOUND,
    message: MANAGEMENT_ERROR_MESSAGES.ROLE_NOT_FOUND,
  });
}

function systemImmutable(): ConflictException {
  return new ConflictException({
    errorCode: MANAGEMENT_ERROR_CODES.ROLE_SYSTEM_IMMUTABLE,
    message: MANAGEMENT_ERROR_MESSAGES.ROLE_SYSTEM_IMMUTABLE,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}

/**
 * Roles API (SPEC §9, T17). Every write requires the actor to outrank the
 * role (and any new rank it sets, D6), so an admin can never touch `admin`
 * or `owner`. Writes bump `policy_version`, commit their audit row with them
 * (D15) and drop the role from the VersionCache after the commit. Permission
 * rows are written only through RolePermissionsService (T15).
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
    private readonly rolePermissions: RolePermissionsService,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
  ) {}

  /** Every role, highest rank first, with its permission rows. */
  async list(actor: AccountActor): Promise<RoleView[]> {
    const [rows, holders] = await Promise.all([
      this.prisma.role.findMany({
        select: ROLE_SELECT,
        orderBy: [{ rank: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.$queryRaw<{ role_id: number; holders: number }[]>`
        SELECT role_id, count(*)::int AS holders FROM accounts GROUP BY role_id`,
    ]);
    const counts = new Map(
      holders.map((group) => [group.role_id, group.holders]),
    );
    return rows.map((row) => this.view(actor, row, counts.get(row.id) ?? 0));
  }

  /** A custom role (rank 11–39) below the actor's rank, with no permissions. */
  async create(
    actor: AccountActor,
    input: CreateRoleRequest,
    meta: ClientMeta,
  ): Promise<RoleView> {
    assertOutranks(actor, input.rank);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Serialised so two creates cannot both pass the cap (Q11).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLE_CAP_LOCK})`;
        const customRoles = await tx.role.count({ where: { isSystem: false } });
        if (customRoles >= MANAGEMENT_LIMITS.MAX_CUSTOM_ROLES) {
          throw new ConflictException({
            errorCode: MANAGEMENT_ERROR_CODES.ROLE_LIMIT_REACHED,
            message: MANAGEMENT_ERROR_MESSAGES.ROLE_LIMIT_REACHED,
          });
        }
        const created = await tx.role.create({
          data: {
            slug: input.slug,
            name: input.name,
            rank: input.rank,
            isSystem: false,
            createdById: actor.accountId,
            updatedById: actor.accountId,
          },
          select: ROLE_SELECT,
        });
        await this.record(tx, actor, created.documentId, meta, {
          action: AUDIT_ACTIONS.ROLE_CREATED,
          metadata: { slug: created.slug, rank: created.rank },
        });
        return created;
      });
      return this.view(actor, row, 0);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          errorCode: MANAGEMENT_ERROR_CODES.ROLE_SLUG_TAKEN,
          message: MANAGEMENT_ERROR_MESSAGES.ROLE_SLUG_TAKEN,
        });
      }
      throw error;
    }
  }

  /** Name and/or rank. System roles keep their rank (409); slugs never change. */
  async update(
    actor: AccountActor,
    documentId: string,
    input: UpdateRoleRequest,
    meta: ClientMeta,
  ): Promise<RoleView> {
    const row = await this.prisma.$transaction(async (tx) => {
      const role = await this.lockManageable(tx, actor, documentId);
      if (input.rank !== undefined) {
        if (role.isSystem) throw systemImmutable();
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

      const updated = await tx.role.update({
        where: { id: role.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.rank !== undefined ? { rank: input.rank } : {}),
          // The rank feeds `$actor.roleRank` and D6 checks: a new policy.
          policyVersion: { increment: 1 },
          updatedById: actor.accountId,
        },
        select: ROLE_SELECT,
      });
      await this.record(tx, actor, updated.documentId, meta, {
        action: AUDIT_ACTIONS.ROLE_UPDATED,
        metadata: { fields },
      });
      return updated;
    });
    this.versions.invalidateRole(row.id);
    return this.view(actor, row, await this.accountCount(row.id));
  }

  /**
   * Deletes a custom role no account holds (T17 Q1): 409 ROLE_IN_USE with
   * the count otherwise, deleted and disabled accounts included; 409
   * ROLE_SYSTEM_IMMUTABLE for a system role.
   */
  async remove(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    const roleId = await this.prisma.$transaction(async (tx) => {
      const role = await this.lockManageable(tx, actor, documentId);
      if (role.isSystem) throw systemImmutable();
      // The row lock above makes a concurrent assignment wait (FK key share).
      const accountCount = await this.accountCount(role.id, tx);
      if (accountCount > 0) {
        throw new ConflictException({
          errorCode: MANAGEMENT_ERROR_CODES.ROLE_IN_USE,
          message: MANAGEMENT_ERROR_MESSAGES.ROLE_IN_USE,
          details: { accountCount },
        });
      }
      await tx.role.delete({ where: { id: role.id } });
      await this.record(tx, actor, role.documentId, meta, {
        action: AUDIT_ACTIONS.ROLE_DELETED,
        metadata: { slug: role.slug },
      });
      return role.id;
    });
    this.versions.invalidateRole(roleId);
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
    const role = await this.findRole(this.prisma, documentId);
    assertOutranks(actor, role.rank);

    const { catalog, evaluator } = await this.access.policy();
    const validated = validatePermissionSet(permissions, catalog);
    if (!validated.ok) {
      throw new BadRequestException({
        errorCode: validated.issues[0]?.code,
        message: validated.issues[0]?.message,
        details: { issues: validated.issues },
      });
    }
    const grants: PermissionGrant[] = validated.value;
    const beyond = grantsBeyondActor(actor, grants, catalog, evaluator);
    if (beyond.length > 0) {
      throw new ForbiddenException({
        errorCode: MANAGEMENT_ERROR_CODES.PERMISSION_NOT_HELD,
        message: MANAGEMENT_ERROR_MESSAGES.PERMISSION_NOT_HELD,
        details: { indexes: beyond },
      });
    }

    await this.rolePermissions.replacePermissions(role.id, grants, {
      actorId: actor.accountId,
      alsoInTransaction: async (tx, policyVersion) => {
        // Re-checked under the lock: the rank may have changed meanwhile.
        const locked = await this.lockManageable(tx, actor, documentId);
        await this.record(tx, actor, locked.documentId, meta, {
          action: AUDIT_ACTIONS.ROLE_PERMISSIONS_REPLACED,
          metadata: {
            subjects: [...new Set(grants.map((grant) => grant.subject))],
            permissionCount: grants.length,
            policyVersion,
          },
        });
      },
    });
    const updated = await this.findRole(this.prisma, documentId);
    return this.view(actor, updated, await this.accountCount(updated.id));
  }

  /** Accounts holding the role, deleted and disabled ones included. */
  private accountCount(
    roleId: number,
    db: Tx | PrismaService = this.prisma,
  ): Promise<number> {
    return db.account.count({ where: { roleId } });
  }

  private async findRole(
    db: Tx | PrismaService,
    documentId: string,
  ): Promise<RoleRow> {
    const role = await db.role.findUnique({
      where: { documentId },
      select: ROLE_SELECT,
    });
    if (role === null) throw roleNotFound();
    return role;
  }

  /** The role, row-locked for this transaction, if the actor outranks it. */
  private async lockManageable(
    tx: Tx,
    actor: AccountActor,
    documentId: string,
  ): Promise<RoleRow> {
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM roles WHERE document_id = ${documentId}::uuid FOR UPDATE`;
    if (locked[0] === undefined) throw roleNotFound();
    const role = await this.findRole(tx, documentId);
    assertOutranks(actor, role.rank);
    return role;
  }

  private record(
    tx: Tx,
    actor: AccountActor,
    targetId: string,
    meta: ClientMeta,
    event: { readonly action: AuditAction; readonly metadata: AuditMetadata },
  ): Promise<void> {
    return this.audit.record(tx, {
      actor: auditActorOf(actor),
      action: event.action,
      subject: ROLES_SUBJECT,
      targetId,
      metadata: event.metadata,
      ip: meta.ip,
    });
  }

  private view(
    actor: AccountActor,
    row: RoleRow,
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
