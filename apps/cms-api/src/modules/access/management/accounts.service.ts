import { ConflictException, Injectable } from '@nestjs/common';

import { type AccountStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { revokeAllSessions } from '../../identity';
import { type ClientMeta } from '../../../common/http/client-meta';
import {
  MANAGEMENT_ERROR_CODES,
  MANAGEMENT_ERROR_MESSAGES,
} from './access-management.constants';
import type { UpdateAccountRequest } from './access-management.requests';
import type { PageMeta, PageQuery } from '../../../common/http/request-parsing';
import { type AccountActor } from '../rank-rules';
import { AUDIT_ACTIONS } from '../../security-audit';
import { auditActorOf, SecurityAuditService } from '../../security-audit';
import { REVIEWER_ROLE_SLUG } from '../roles/system-roles';
import { VersionCache } from '../version-cache';
import {
  ACCOUNT_SELECT,
  type AccountView,
  lockAssignableRole,
  lockManageableAccount,
  recordAccountEvent,
  toAccountView,
} from './account-records';

/** `GET /accounts` response. */
export interface AccountPage {
  readonly data: AccountView[];
  readonly meta: PageMeta;
}

/**
 * Accounts API (SPEC §9): list and the lifecycle of existing accounts (invitations
 * live in InvitationsService). Every write checks D6
 * inside its transaction, with the target row locked: the actor must
 * outrank the target account and any role it assigns, and never targets
 * itself. Each write commits its audit row with it (D15) and then drops the
 * account from the VersionCache, so the change applies on the next request.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
  ) {}

  /** One page of the accounts that are not deleted, oldest first. */
  async list(
    actor: AccountActor,
    { page, pageSize }: PageQuery,
  ): Promise<AccountPage> {
    // Ephemeral reviewer accounts belong to the reviewer module.
    const where = { deletedAt: null, roleSlug: { not: REVIEWER_ROLE_SLUG } };
    const [rows, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        select: ACCOUNT_SELECT,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.account.count({ where }),
    ]);
    return {
      data: rows.map((row) => toAccountView(actor, row)),
      meta: { page, pageSize, total },
    };
  }

  /** Display name and/or role. A role change takes effect on the next request. */
  async update(
    actor: AccountActor,
    documentId: string,
    input: UpdateAccountRequest,
    meta: ClientMeta,
  ): Promise<AccountView> {
    const auditActor = auditActorOf(actor);
    const row = await this.prisma.$transaction(async (tx) => {
      const target = await lockManageableAccount(tx, actor, documentId);
      const role =
        input.roleId === undefined
          ? undefined
          : await lockAssignableRole(tx, actor, input.roleId);
      const roleChanged = role !== undefined && role.id !== target.role.id;
      const nameChanged =
        input.displayName !== undefined &&
        input.displayName !== target.displayName;

      const updated = await tx.account.update({
        where: { id: target.id },
        data: {
          ...(nameChanged && input.displayName !== undefined
            ? { displayName: input.displayName }
            : {}),
          ...(roleChanged
            ? {
                role: {
                  connect: { id_slug: { id: role.id, slug: role.slug } },
                },
              }
            : {}),
          updatedBy: { connect: { id: actor.accountId } },
        },
        select: ACCOUNT_SELECT,
      });
      if (nameChanged) {
        await recordAccountEvent(this.audit, tx, auditActor, updated, meta, {
          action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
          metadata: { fields: ['displayName'] },
        });
      }
      if (roleChanged) {
        await recordAccountEvent(this.audit, tx, auditActor, updated, meta, {
          action: AUDIT_ACTIONS.ACCOUNT_ROLE_CHANGED,
          metadata: { fromRole: target.role.slug, toRole: role.slug },
        });
      }
      return updated;
    });
    this.versions.invalidateAccount(row.id);
    return toAccountView(actor, row);
  }

  /**
   * Disables the account and ends every session at once: status, a
   * token_version bump and every refresh token revoked, in one transaction.
   */
  async disable(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    const accountId = await this.prisma.$transaction(async (tx) => {
      const target = await lockManageableAccount(tx, actor, documentId);
      if (target.status === 'disabled') {
        throw new ConflictException({
          errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_ALREADY_DISABLED,
          message: MANAGEMENT_ERROR_MESSAGES.ACCOUNT_ALREADY_DISABLED,
        });
      }
      await tx.account.update({
        where: { id: target.id },
        data: {
          status: 'disabled',
          updatedBy: { connect: { id: actor.accountId } },
        },
      });
      await revokeAllSessions(tx, target.id);
      await recordAccountEvent(
        this.audit,
        tx,
        auditActorOf(actor),
        target,
        meta,
        {
          action: AUDIT_ACTIONS.ACCOUNT_DISABLED,
        },
      );
      return target.id;
    });
    this.versions.invalidateAccount(accountId);
  }

  /**
   * Re-enables a disabled account: back to `active` when it has a
   * password, else to `invited` (it never finished its invite). No
   * token_version change: disable already bumped it, so old tokens stay dead.
   */
  async enable(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    const accountId = await this.prisma.$transaction(async (tx) => {
      const target = await lockManageableAccount(tx, actor, documentId);
      if (target.status !== 'disabled') {
        throw new ConflictException({
          errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_NOT_DISABLED,
          message: MANAGEMENT_ERROR_MESSAGES.ACCOUNT_NOT_DISABLED,
        });
      }
      const credentials = await tx.account.findUniqueOrThrow({
        where: { id: target.id },
        select: { passwordHash: true },
      });
      const status: AccountStatus =
        credentials.passwordHash === null ? 'invited' : 'active';
      await tx.account.update({
        where: { id: target.id },
        data: { status, updatedBy: { connect: { id: actor.accountId } } },
      });
      await recordAccountEvent(
        this.audit,
        tx,
        auditActorOf(actor),
        target,
        meta,
        {
          action: AUDIT_ACTIONS.ACCOUNT_ENABLED,
          metadata: { status },
        },
      );
      return target.id;
    });
    this.versions.invalidateAccount(accountId);
  }

  /** Signs the account out everywhere: token_version bump + refresh tokens revoked. */
  async revokeSessions(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    const accountId = await this.prisma.$transaction(async (tx) => {
      const target = await lockManageableAccount(tx, actor, documentId);
      await revokeAllSessions(tx, target.id);
      await recordAccountEvent(
        this.audit,
        tx,
        auditActorOf(actor),
        target,
        meta,
        {
          action: AUDIT_ACTIONS.ACCOUNT_SESSIONS_REVOKED,
        },
      );
      return target.id;
    });
    this.versions.invalidateAccount(accountId);
  }
}
