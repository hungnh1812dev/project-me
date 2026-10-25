import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';

import { type IAppConfig } from '../../../config/app-config';
import { APP_CONFIG } from '../../../config/config.constants';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  MAIL_SENDER,
  type MailSender,
} from '../../../infrastructure/mail/mail.port';
import { buildOtpMail, OtpService } from '../../identity';
import { type ClientMeta } from '../../../common/http/client-meta';
import {
  MANAGEMENT_ERROR_CODES,
  MANAGEMENT_ERROR_MESSAGES,
} from './access-management.constants';
import type { InviteAccountRequest } from './access-management.requests';
import { type AccountActor } from '../domain/Rank.rules';
import { AUDIT_ACTIONS } from '../../security-audit';
import { auditActorOf, SecurityAuditService } from '../../security-audit';
import {
  ACCOUNT_SELECT,
  type AccountRow,
  type AccountView,
  emailTaken,
  isUniqueViolation,
  lockAssignableRole,
  lockManageableAccount,
  recordAccountEvent,
  toAccountView,
} from './account-records';

const LOGGER_CONTEXT = 'InvitationsService';
const INVITE_PURPOSE = 'INVITE_SET_PASSWORD';

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
  private readonly logger = new Logger(LOGGER_CONTEXT);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly audit: SecurityAuditService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
  ) {}

  /**
   * Creates an `invited` account and its INVITE_SET_PASSWORD code in one
   * transaction (a 429 from the code cap rolls the account back), then
   * emails the code. A failed delivery keeps the account: the invitee can
   * ask for a new code with `request-otp` (invited -> invite code).
   */
  async invite(
    actor: AccountActor,
    input: InviteAccountRequest,
    meta: ClientMeta,
  ): Promise<InvitedAccountView> {
    const auditActor = auditActorOf(actor);
    let created: { row: AccountRow; code: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const role = await lockAssignableRole(tx, actor, input.roleId);
        const taken = await tx.account.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (taken !== null) throw emailTaken();
        const row = await tx.account.create({
          data: {
            email: input.email,
            displayName: input.displayName,
            status: 'invited',
            role: { connect: { id_slug: { id: role.id, slug: role.slug } } },
            createdBy: { connect: { id: actor.accountId } },
            updatedBy: { connect: { id: actor.accountId } },
          },
          select: ACCOUNT_SELECT,
        });
        await recordAccountEvent(this.audit, tx, auditActor, row, meta, {
          action: AUDIT_ACTIONS.ACCOUNT_INVITED,
          metadata: { role: role.slug },
        });
        const code = await this.otp.issue(row.id, INVITE_PURPOSE, {
          actor: auditActor,
          ip: meta.ip,
          tx,
        });
        return { row, code };
      });
    } catch (error) {
      // A concurrent invite of the same email won the unique index.
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }

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
    const issued = await this.prisma.$transaction(async (tx) => {
      const target = await lockManageableAccount(tx, actor, documentId);
      if (target.status !== 'invited') {
        throw new ConflictException({
          errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_NOT_INVITED,
          message: MANAGEMENT_ERROR_MESSAGES.ACCOUNT_NOT_INVITED,
        });
      }
      await recordAccountEvent(this.audit, tx, auditActor, target, meta, {
        action: AUDIT_ACTIONS.ACCOUNT_INVITE_RESENT,
      });
      const code = await this.otp.issue(target.id, INVITE_PURPOSE, {
        actor: auditActor,
        ip: meta.ip,
        tx,
      });
      return { row: target, code };
    });
    return { invitationSent: await this.sendInvite(issued.row, issued.code) };
  }

  /** Mails the invite code; false (logged without address or code) on failure. */
  private async sendInvite(row: AccountRow, code: string): Promise<boolean> {
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
      );
      return false;
    }
  }
}
