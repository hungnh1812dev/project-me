import { Inject, Injectable } from '@nestjs/common';

import type { ClientMeta } from '../../../../common/types/ClientMeta.entity';
import { type IAppConfig } from '../../../../config/app-config';
import { APP_CONFIG } from '../../../../config/config.constants';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../../infrastructure/database/TransactionRunner.port';
import {
  APP_LOGGER,
  type AppLogger,
} from '../../../../infrastructure/logging/AppLogger.port';
import {
  MAIL_SENDER,
  type MailSender,
} from '../../../../infrastructure/mail/mail.port';
import { buildOtpMail, OtpService } from '../../../identity';
import {
  AUDIT_ACTIONS,
  auditActorOf,
  SecurityAuditService,
} from '../../../security-audit';
import { AccountStatus } from '../../domain/Access.constants';
import { type AccountActor } from '../../domain/Rank.rules';
import {
  accountNotInvited,
  emailTaken,
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
import { recordAccountEvent } from './Accounts.service';

const LOGGER_CONTEXT = 'InvitationsService';
const INVITE_PURPOSE = 'INVITE_SET_PASSWORD';

/** `POST /accounts` body, already validated. */
export interface AccountInvite {
  readonly email: string;
  readonly displayName: string;
  /** The role's `document_id`. */
  readonly roleId: string;
}

/** `POST /accounts`: false when the invite email could not be delivered. */
export interface InvitedAccountView extends AccountView {
  readonly invitationSent: boolean;
}

/**
 * Invitations (SPEC §9): creating an `invited` account and re-sending its
 * code. Both run the D6 rank check and the assignable-role check inside
 * their transaction, and commit their audit row with the change (D15).
 */
@Injectable()
export class InvitationsService {
  constructor(
    @Inject(CORE_TRANSACTION_RUNNER) private readonly runner: TransactionRunner,
    @Inject(ACCOUNT_ADMIN_REPOSITORY)
    private readonly accounts: AccountAdminRepository,
    private readonly otp: OtpService,
    private readonly audit: SecurityAuditService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  /**
   * Creates an `invited` account and its INVITE_SET_PASSWORD code in one
   * transaction (a 429 from the code cap rolls the account back), then
   * emails the code. A failed delivery keeps the account: the invitee can
   * ask for a new code with `request-otp` (invited -> invite code).
   */
  async invite(
    actor: AccountActor,
    input: AccountInvite,
    meta: ClientMeta,
  ): Promise<InvitedAccountView> {
    const auditActor = auditActorOf(actor);
    const created = await this.runner.run(async (unit) => {
      const role = assertAssignable(
        actor,
        await this.accounts.lockRoleForAssignment(unit, input.roleId),
      );
      if (await this.accounts.isEmailTaken(unit, input.email)) {
        throw emailTaken();
      }
      const row = await this.accounts.create(unit, {
        email: input.email,
        displayName: input.displayName,
        role: { id: role.id, slug: role.slug },
        actorId: actor.accountId,
      });
      await recordAccountEvent(this.audit, unit, actor, row, meta, {
        action: AUDIT_ACTIONS.ACCOUNT_INVITED,
        metadata: { role: role.slug },
      });
      const code = await this.otp.issue(row.id, INVITE_PURPOSE, {
        actor: auditActor,
        ip: meta.ip,
        unit,
      });
      return { row, code };
    });

    const invitationSent = await this.sendInvite(created.row, created.code);
    return { ...toAccountView(actor, created.row), invitationSent };
  }

  /**
   * Issues a new invite code for an `invited` account. The new code
   * and the audit row commit together (older invite codes stop working; the
   * hourly code cap answers 429 and rolls everything back), then it is
   * mailed. `invitationSent` means what it means for `invite`.
   */
  async resendInvite(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<{ invitationSent: boolean }> {
    const auditActor = auditActorOf(actor);
    const issued = await this.runner.run(async (unit) => {
      const target = assertManageable(
        actor,
        await this.accounts.lockManageable(unit, documentId),
      );
      if (target.status !== AccountStatus.invited) throw accountNotInvited();
      await recordAccountEvent(this.audit, unit, actor, target, meta, {
        action: AUDIT_ACTIONS.ACCOUNT_INVITE_RESENT,
      });
      const code = await this.otp.issue(target.id, INVITE_PURPOSE, {
        actor: auditActor,
        ip: meta.ip,
        unit,
      });
      return { row: target, code };
    });
    return { invitationSent: await this.sendInvite(issued.row, issued.code) };
  }

  /** Mails the invite code; false (logged without address or code) on failure. */
  private async sendInvite(row: AccountRecord, code: string): Promise<boolean> {
    try {
      await this.mail.send(
        buildOtpMail(
          row.email,
          INVITE_PURPOSE,
          code,
          this.config.cors.allowedOrigins[0],
        ),
      );
      return true;
    } catch (error) {
      // Name and code only: SMTP error messages can echo the recipient.
      const name = error instanceof Error ? error.name : typeof error;
      const errorCode = (error as { code?: unknown } | null)?.code;
      this.logger.warn(
        `Invite email not delivered: ${name}${typeof errorCode === 'string' ? ` (${errorCode})` : ''}`,
        LOGGER_CONTEXT,
      );
      return false;
    }
  }
}
