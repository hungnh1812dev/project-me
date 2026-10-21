import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import {
  type AccountStatus,
  Prisma,
  type TwoFaMethod,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  MAIL_SENDER,
  type MailSender,
} from '../../infrastructure/mail/mail.port';
import { buildOtpMail } from '../identity/otp-mail';
import { OtpService } from '../identity/otp.service';
import {
  type ClientMeta,
  revokeAllRefreshTokens,
} from '../identity/refresh-token.service';
import {
  MANAGEMENT_ERROR_CODES,
  MANAGEMENT_ERROR_MESSAGES,
  UNASSIGNABLE_ROLE_SLUGS,
} from './access-management.constants';
import type {
  InviteAccountRequest,
  UpdateAccountRequest,
} from './access-management.requests';
import {
  type AccountActor,
  assertOutranks,
  outranks,
  rankForbidden,
} from './rank-rules';
import { AUDIT_ACTIONS } from './security-audit.constants';
import {
  type AuditActor,
  auditActorOf,
  SecurityAuditService,
} from './security-audit.service';
import { VersionCache } from './version-cache';

type Tx = Prisma.TransactionClient;

const LOGGER_CONTEXT = 'AccountsService';
const INVITE_PURPOSE = 'INVITE_SET_PASSWORD';
const ACCOUNTS_SUBJECT = 'accounts';
/** Postgres unique violation, as Prisma reports it. */
const UNIQUE_VIOLATION = 'P2002';

/** A role as accounts show it. */
export interface AccountRoleView {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly rank: number;
}

/** `GET /accounts` item. No password, secret or token data. */
export interface AccountView {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: AccountStatus;
  readonly twoFactorEnabled: boolean;
  readonly twoFactorMethod: TwoFaMethod | null;
  readonly role: AccountRoleView;
  readonly createdAt: string;
  /** Whether the current actor may update, disable or sign out this account (D6). */
  readonly manageable: boolean;
}

/** `POST /accounts`: false when the invite email could not be delivered. */
export interface InvitedAccountView extends AccountView {
  readonly invitationSent: boolean;
}

const ROLE_SELECT = {
  id: true,
  documentId: true,
  slug: true,
  name: true,
  rank: true,
  isSystem: true,
} as const;

const ACCOUNT_SELECT = {
  id: true,
  documentId: true,
  email: true,
  displayName: true,
  status: true,
  is2faEnabled: true,
  twoFaMethod: true,
  createdAt: true,
  role: { select: ROLE_SELECT },
} as const;

type AccountRow = Prisma.AccountGetPayload<{ select: typeof ACCOUNT_SELECT }>;
type RoleRow = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>;

function accountNotFound(): NotFoundException {
  return new NotFoundException({
    errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_NOT_FOUND,
    message: MANAGEMENT_ERROR_MESSAGES.ACCOUNT_NOT_FOUND,
  });
}

function roleNotFound(): NotFoundException {
  return new NotFoundException({
    errorCode: MANAGEMENT_ERROR_CODES.ROLE_NOT_FOUND,
    message: MANAGEMENT_ERROR_MESSAGES.ROLE_NOT_FOUND,
  });
}

function emailTaken(): ConflictException {
  return new ConflictException({
    errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_EMAIL_TAKEN,
    message: MANAGEMENT_ERROR_MESSAGES.ACCOUNT_EMAIL_TAKEN,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}

function isAssignable(role: RoleRow): boolean {
  return !(
    role.isSystem &&
    (UNASSIGNABLE_ROLE_SLUGS as readonly string[]).includes(role.slug)
  );
}

/**
 * Accounts API (SPEC §9, T17). Invite-only (Q2). Every write checks D6
 * inside its transaction, with the target row locked: the actor must
 * outrank the target account and any role it assigns, and never targets
 * itself. Each write commits its audit row with it (D15) and then drops the
 * account from the VersionCache, so the change applies on the next request.
 */
@Injectable()
export class AccountsService {
  private readonly logger = new Logger(LOGGER_CONTEXT);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
  ) {}

  /** Every account that is not deleted, oldest first. */
  async list(actor: AccountActor): Promise<AccountView[]> {
    const rows = await this.prisma.account.findMany({
      where: { deletedAt: null },
      select: ACCOUNT_SELECT,
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => this.view(actor, row));
  }

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
        const role = await this.assignableRole(tx, actor, input.roleId);
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
        await this.recordAccount(tx, auditActor, row, meta, {
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
    return { ...this.view(actor, created.row), invitationSent };
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
      const target = await this.lockManageable(tx, actor, documentId);
      const role =
        input.roleId === undefined
          ? undefined
          : await this.assignableRole(tx, actor, input.roleId);
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
        await this.recordAccount(tx, auditActor, updated, meta, {
          action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
          metadata: { fields: ['displayName'] },
        });
      }
      if (roleChanged) {
        await this.recordAccount(tx, auditActor, updated, meta, {
          action: AUDIT_ACTIONS.ACCOUNT_ROLE_CHANGED,
          metadata: { fromRole: target.role.slug, toRole: role.slug },
        });
      }
      return updated;
    });
    this.versions.invalidateAccount(row.id);
    return this.view(actor, row);
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
      const target = await this.lockManageable(tx, actor, documentId);
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
          tokenVersion: { increment: 1 },
          updatedBy: { connect: { id: actor.accountId } },
        },
      });
      await revokeAllRefreshTokens(tx, target.id);
      await this.recordAccount(tx, auditActorOf(actor), target, meta, {
        action: AUDIT_ACTIONS.ACCOUNT_DISABLED,
      });
      return target.id;
    });
    this.versions.invalidateAccount(accountId);
  }

  /**
   * Re-enables a disabled account (T17a, Q7): back to `active` when it has a
   * password, else to `invited` (it never finished its invite). No
   * token_version change: disable already bumped it, so old tokens stay dead.
   */
  async enable(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    const accountId = await this.prisma.$transaction(async (tx) => {
      const target = await this.lockManageable(tx, actor, documentId);
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
      await this.recordAccount(tx, auditActorOf(actor), target, meta, {
        action: AUDIT_ACTIONS.ACCOUNT_ENABLED,
        metadata: { status },
      });
      return target.id;
    });
    this.versions.invalidateAccount(accountId);
  }

  /**
   * Issues a new invite code for an `invited` account (T17a). The new code
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
      const target = await this.lockManageable(tx, actor, documentId);
      if (target.status !== 'invited') {
        throw new ConflictException({
          errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_NOT_INVITED,
          message: MANAGEMENT_ERROR_MESSAGES.ACCOUNT_NOT_INVITED,
        });
      }
      await this.recordAccount(tx, auditActor, target, meta, {
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

  /** Signs the account out everywhere: token_version bump + refresh tokens revoked. */
  async revokeSessions(
    actor: AccountActor,
    documentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    const accountId = await this.prisma.$transaction(async (tx) => {
      const target = await this.lockManageable(tx, actor, documentId);
      await tx.account.update({
        where: { id: target.id },
        data: { tokenVersion: { increment: 1 } },
      });
      await revokeAllRefreshTokens(tx, target.id);
      await this.recordAccount(tx, auditActorOf(actor), target, meta, {
        action: AUDIT_ACTIONS.ACCOUNT_SESSIONS_REVOKED,
      });
      return target.id;
    });
    this.versions.invalidateAccount(accountId);
  }

  /**
   * The target account, row-locked for this transaction, after the D6
   * checks: 404 when unknown or deleted, 403 for the actor itself or an
   * account of equal or higher rank.
   */
  private async lockManageable(
    tx: Tx,
    actor: AccountActor,
    documentId: string,
  ): Promise<AccountRow> {
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM accounts
      WHERE document_id = ${documentId}::uuid AND deleted_at IS NULL
      FOR UPDATE`;
    const id = locked[0]?.id;
    if (id === undefined) throw accountNotFound();
    if (id === actor.accountId) throw rankForbidden();
    const target = await tx.account.findUniqueOrThrow({
      where: { id },
      select: ACCOUNT_SELECT,
    });
    assertOutranks(actor, target.role.rank);
    return target;
  }

  /**
   * The role to assign: 404 when unknown, 403 unless the actor outranks it
   * (so `owner` is never assignable, D6), 400 for roles accounts never hold.
   * Locked for share so its rank can't change before the commit.
   */
  private async assignableRole(
    tx: Tx,
    actor: AccountActor,
    roleDocumentId: string,
  ): Promise<RoleRow> {
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM roles WHERE document_id = ${roleDocumentId}::uuid
      FOR SHARE`;
    const id = locked[0]?.id;
    if (id === undefined) throw roleNotFound();
    const role = await tx.role.findUniqueOrThrow({
      where: { id },
      select: ROLE_SELECT,
    });
    assertOutranks(actor, role.rank);
    if (!isAssignable(role)) {
      throw new BadRequestException({
        errorCode: MANAGEMENT_ERROR_CODES.ROLE_NOT_ASSIGNABLE,
        message: MANAGEMENT_ERROR_MESSAGES.ROLE_NOT_ASSIGNABLE,
      });
    }
    return role;
  }

  private recordAccount(
    tx: Tx,
    actor: AuditActor,
    target: { readonly documentId: string },
    meta: ClientMeta,
    event: {
      readonly action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
      readonly metadata?: Readonly<Record<string, string | readonly string[]>>;
    },
  ): Promise<void> {
    return this.audit.record(tx, {
      actor,
      action: event.action,
      subject: ACCOUNTS_SUBJECT,
      targetId: target.documentId,
      metadata: event.metadata,
      ip: meta.ip,
    });
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

  private view(actor: AccountActor, row: AccountRow): AccountView {
    return {
      id: row.documentId,
      email: row.email,
      displayName: row.displayName,
      status: row.status,
      twoFactorEnabled: row.is2faEnabled,
      twoFactorMethod: row.is2faEnabled ? row.twoFaMethod : null,
      role: {
        id: row.role.documentId,
        slug: row.role.slug,
        name: row.role.name,
        rank: row.role.rank,
      },
      createdAt: row.createdAt.toISOString(),
      manageable: row.id !== actor.accountId && outranks(actor, row.role.rank),
    };
  }
}
