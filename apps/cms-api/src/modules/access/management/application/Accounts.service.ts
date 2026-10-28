import { Inject, Injectable } from '@nestjs/common';

import type { ClientMeta } from '../../../../common/types/ClientMeta.entity';
import type {
  PageMeta,
  PageQuery,
} from '../../../../common/validation/SharedSchemas.rules';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../../infrastructure/database/TransactionRunner.port';
import { SessionRevocationService } from '../../../identity';
import {
  AUDIT_ACTIONS,
  type AuditAction,
  auditActorOf,
  SecurityAuditService,
} from '../../../security-audit';
import { AccountStatus } from '../../domain/Access.constants';
import { type AccountActor } from '../../domain/Rank.rules';
import { VersionCache } from '../../application/VersionCache.service';
import {
  ACCOUNT_UPDATABLE_FIELDS,
  MANAGEMENT_AUDIT_SUBJECTS,
} from '../domain/AccessManagement.constants';
import {
  accountAlreadyDisabled,
  accountNotDisabled,
} from '../domain/AccessManagement.errors';
import {
  type AccountRecord,
  type AccountView,
  assertAssignable,
  assertManageable,
  toAccountView,
} from '../domain/Account.entity';
import {
  ACCOUNT_ADMIN_REPOSITORY,
  type AccountAdminRepository,
} from './AccessManagement.port';

export interface AccountAuditEvent {
  readonly action: AuditAction;
  readonly metadata?: Readonly<Record<string, string | readonly string[]>>;
}

/** Writes the audit row of an account change inside the caller's unit (D15). */
export function recordAccountEvent(
  audit: SecurityAuditService,
  unit: UnitOfWork,
  actor: AccountActor,
  target: { readonly documentId: string },
  meta: ClientMeta,
  event: AccountAuditEvent,
): Promise<void> {
  return audit.record(unit, {
    actor: auditActorOf(actor),
    action: event.action,
    subject: MANAGEMENT_AUDIT_SUBJECTS.ACCOUNTS,
    targetId: target.documentId,
    metadata: event.metadata,
    ip: meta.ip,
  });
}

/** `PATCH /accounts/:id` fields, already validated. */
export interface AccountUpdate {
  readonly displayName?: string | undefined;
  /** The role's `document_id`. */
  readonly roleId?: string | undefined;
}

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
 * itself. Each write commits its audit row with it (D15) and drops the
 * account from the VersionCache after the commit, so the change applies on the next request.
 */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(CORE_TRANSACTION_RUNNER) private readonly runner: TransactionRunner,
    @Inject(ACCOUNT_ADMIN_REPOSITORY)
    private readonly accounts: AccountAdminRepository,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
    private readonly sessions: SessionRevocationService,
  ) {}

  /** One page of the accounts that are not deleted, oldest first. */
  async list(
    actor: AccountActor,
    { page, pageSize }: PageQuery,
  ): Promise<AccountPage> {
    const { rows, total } = await this.accounts.listPage(page, pageSize);
    return {
      data: rows.map((row) => toAccountView(actor, row)),
      meta: { page, pageSize, total },
    };
  }

  /** Display name and/or role. A role change takes effect on the next request. */
  async update(
    actor: AccountActor,
    documentId: string,
    input: AccountUpdate,
    meta: ClientMeta,
  ): Promise<AccountView> {
    const row = await this.runner.run(async (unit) => {
      const target = await this.lockManageable(unit, actor, documentId);
      const role =
        input.roleId === undefined
          ? undefined
          : assertAssignable(
              actor,
              await this.accounts.lockRoleForAssignment(unit, input.roleId),
            );
      const roleChanged = role !== undefined && role.id !== target.role.id;
      const nameChanged =
        input.displayName !== undefined &&
        input.displayName !== target.displayName;

      const updated = await this.accounts.update(unit, target.id, {
        ...(nameChanged && input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
        ...(roleChanged ? { role: { id: role.id, slug: role.slug } } : {}),
        actorId: actor.accountId,
      });
      if (nameChanged) {
        await recordAccountEvent(this.audit, unit, actor, updated, meta, {
          action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
          metadata: { fields: ACCOUNT_UPDATABLE_FIELDS },
        });
      }
      if (roleChanged) {
        await recordAccountEvent(this.audit, unit, actor, updated, meta, {
          action: AUDIT_ACTIONS.ACCOUNT_ROLE_CHANGED,
          metadata: { fromRole: target.role.slug, toRole: role.slug },
        });
      }
      this.dropAfterCommit(unit, updated.id);
      return updated;
    });
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
    await this.runner.run(async (unit) => {
      const target = await this.lockManageable(unit, actor, documentId);
      if (target.status === AccountStatus.disabled) {
        throw accountAlreadyDisabled();
      }
      await this.accounts.setStatus(
        unit,
        target.id,
        AccountStatus.disabled,
        actor.accountId,
      );
      await this.sessions.revokeAll(unit, target.id);
      await recordAccountEvent(this.audit, unit, actor, target, meta, {
        action: AUDIT_ACTIONS.ACCOUNT_DISABLED,
      });
      this.dropAfterCommit(unit, target.id);
    });
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
    await this.runner.run(async (unit) => {
      const target = await this.lockManageable(unit, actor, documentId);
      if (target.status !== AccountStatus.disabled) {
        throw accountNotDisabled();
      }
      const status = (await this.accounts.hasPassword(unit, target.id))
        ? AccountStatus.active
        : AccountStatus.invited;
      await this.accounts.setStatus(unit, target.id, status, actor.accountId);
      await recordAccountEvent(this.audit, unit, actor, target, meta, {
        action: AUDIT_ACTIONS.ACCOUNT_ENABLED,
        metadata: { status },
      });
      this.dropAfterCommit(unit, target.id);
    });
  }

  /** Signs the account out everywhere: token_version bump + refresh tokens revoked. */
  async revokeSessions(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    await this.runner.run(async (unit) => {
      const target = await this.lockManageable(unit, actor, documentId);
      await this.sessions.revokeAll(unit, target.id);
      await recordAccountEvent(this.audit, unit, actor, target, meta, {
        action: AUDIT_ACTIONS.ACCOUNT_SESSIONS_REVOKED,
      });
      this.dropAfterCommit(unit, target.id);
    });
  }

  private async lockManageable(
    unit: UnitOfWork,
    actor: AccountActor,
    documentId: string,
  ): Promise<AccountRecord> {
    return assertManageable(
      actor,
      await this.accounts.lockManageable(unit, documentId),
    );
  }

  private dropAfterCommit(unit: UnitOfWork, accountId: number): void {
    unit.afterCommit(() => this.versions.invalidateAccount(accountId));
  }
}
