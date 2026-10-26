import { argon2id, hash, verify } from 'argon2';
import { Inject, Injectable } from '@nestjs/common';

import type { ClientMeta } from '../../../common/types/ClientMeta.entity';
import { type IAppConfig } from '../../../config/app-config';
import { APP_CONFIG } from '../../../config/config.constants';
import {
  APP_LOGGER,
  type AppLogger,
} from '../../../infrastructure/logging/AppLogger.port';
import {
  MAIL_SENDER,
  type MailSender,
} from '../../../infrastructure/mail/mail.port';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../infrastructure/database/TransactionRunner.port';
import { AccountStatus, VersionCache } from '../../access';
import {
  AUDIT_ACTIONS,
  type AuditAction,
  REAUTH_FAILURE_REASONS,
  SecurityAuditService,
  selfActor,
} from '../../security-audit';
import { isAcceptablePassword } from '../domain/Authentication.rules';
import { ARGON2_OPTIONS, OTP, OtpPurpose } from '../domain/Identity.constants';
import {
  invalidOtp,
  notSignedIn,
  totpRequired,
  weakPassword,
  wrongCurrentPassword,
} from '../domain/Identity.errors';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
  RESET_SECOND_FACTOR,
  type ResetSecondFactor,
} from './Identity.port';
import { buildOtpMail, isOtpCodeFormat, OtpService } from './Otp.service';
import { SessionRevocationService } from './SessionRevocation.service';

const LOGGER_CONTEXT = 'PasswordService';
/** Hashed for unknown emails so they cost the same HMAC as a real check. */
const PLACEHOLDER_CODE = '0'.repeat(OTP.DIGITS);

/** Account status -> the code `request-otp` sends. */
const OTP_PURPOSE_BY_STATUS: Readonly<
  Partial<Record<AccountStatus, OtpPurpose>>
> = {
  [AccountStatus.invited]: OtpPurpose.INVITE_SET_PASSWORD,
  [AccountStatus.active]: OtpPurpose.RESET_PASSWORD,
};

/** Argon2id hash in PHC string form (salt and parameters included). */
export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id, ...ARGON2_OPTIONS });
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}

export interface ResetPasswordInput {
  readonly email: string;
  readonly code: string;
  readonly newPassword: string;
  readonly totpCode?: string | undefined;
}

export interface SetPasswordInput {
  readonly email: string;
  readonly code: string;
  readonly newPassword: string;
}

export interface ChangePasswordInput {
  readonly currentPassword: string;
  readonly newPassword: string;
}

/**
 * Password lifecycle (SPEC §9, D8): emailed codes for reset and invite,
 * and change while signed in. Every password write bumps `token_version`
 * and revokes every refresh token of the account (§12-10), so all sessions
 * end, the current one included.
 */
@Injectable()
export class PasswordService {
  /** Background code issues still running (awaited on shutdown). */
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(CORE_TRANSACTION_RUNNER)
    private readonly runner: TransactionRunner,
    private readonly otp: OtpService,
    private readonly sessions: SessionRevocationService,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(RESET_SECOND_FACTOR)
    private readonly secondFactor: ResetSecondFactor,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  /**
   * Starts sending a code and returns at once, before any account lookup:
   * the response is the same, in body and timing, for every email (D8). The
   * lookup, issue and send run in the background; failures are logged
   * without the email or the code.
   */
  requestOtp(email: string, meta: ClientMeta): void {
    const task = this.issueAndSend(email, meta).catch((error: unknown) => {
      // Name and code only: SMTP error messages can echo the recipient.
      const name = error instanceof Error ? error.name : typeof error;
      const code = (error as { code?: unknown } | null)?.code;
      this.logger.warn(
        `OTP request not delivered: ${name}${typeof code === 'string' ? ` (${code})` : ''}`,
        LOGGER_CONTEXT,
      );
    });
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  /** Resolves when every background code issue has finished. */
  async whenIdle(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  /** Forgotten password: emailed RESET_PASSWORD code (+ TOTP when enabled). */
  async reset(input: ResetPasswordInput, meta: ClientMeta): Promise<void> {
    if (!isAcceptablePassword(input.newPassword)) throw weakPassword();
    const account = await this.findForCode(input.email, AccountStatus.active);
    const otpId = await this.checkCode(
      account,
      OtpPurpose.RESET_PASSWORD,
      input.code,
    );

    if (account.is2faEnabled && account.twoFaMethod === 'totp') {
      const ok = await this.secondFactor.verify(account.id, input.totpCode);
      if (!ok) throw totpRequired();
    }

    await this.writePassword(account, input.newPassword, {
      otpId,
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      meta,
    });
  }

  /** Invite: emailed INVITE_SET_PASSWORD code; the account becomes active. */
  async set(input: SetPasswordInput, meta: ClientMeta): Promise<void> {
    if (!isAcceptablePassword(input.newPassword)) throw weakPassword();
    const account = await this.findForCode(input.email, AccountStatus.invited);
    const otpId = await this.checkCode(
      account,
      OtpPurpose.INVITE_SET_PASSWORD,
      input.code,
    );
    await this.writePassword(account, input.newPassword, {
      otpId,
      action: AUDIT_ACTIONS.PASSWORD_SET,
      meta,
      status: AccountStatus.active,
    });
  }

  /** Signed in: needs the current password. Ends every session. */
  async change(
    accountDocumentId: string,
    input: ChangePasswordInput,
    meta: ClientMeta,
  ): Promise<void> {
    if (!isAcceptablePassword(input.newPassword)) throw weakPassword();
    const account = await this.accounts.findPasswordAccount(accountDocumentId);
    if (
      account === null ||
      account.passwordHash === null ||
      account.status !== AccountStatus.active ||
      account.deletedAt !== null
    ) {
      throw notSignedIn();
    }
    if (!(await verifyPassword(account.passwordHash, input.currentPassword))) {
      await this.audit.recordStandalone({
        actor: selfActor(account.id),
        action: AUDIT_ACTIONS.PASSWORD_CHANGE_FAILED,
        targetId: account.documentId,
        metadata: { reason: REAUTH_FAILURE_REASONS.BAD_PASSWORD },
        ip: meta.ip,
      });
      throw wrongCurrentPassword();
    }
    await this.writePassword(account, input.newPassword, {
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      meta,
    });
  }

  private async issueAndSend(email: string, meta: ClientMeta): Promise<void> {
    const account = await this.accounts.findCodeAccount(email);
    const purpose =
      account === null || account.deletedAt !== null
        ? undefined
        : OTP_PURPOSE_BY_STATUS[account.status];
    if (account === null || purpose === undefined) {
      // Unknown, deleted or disabled: no code, same HMAC work.
      this.otp.hashForUnknownAccount(
        OtpPurpose.RESET_PASSWORD,
        PLACEHOLDER_CODE,
      );
      return;
    }

    const code = await this.otp.issue(account.id, purpose, { ip: meta.ip });
    await this.mail.send(
      buildOtpMail(
        account.email,
        purpose,
        code,
        this.config.cors.allowedOrigins[0],
      ),
    );
  }

  private async findForCode(email: string, status: AccountStatus) {
    const account = await this.accounts.findCodeAccount(email);
    if (
      account === null ||
      account.status !== status ||
      account.deletedAt !== null
    ) {
      this.otp.hashForUnknownAccount(
        OtpPurpose.RESET_PASSWORD,
        PLACEHOLDER_CODE,
      );
      throw invalidOtp();
    }
    return account;
  }

  private async checkCode(
    account: { readonly id: number },
    purpose: OtpPurpose,
    code: string,
  ): Promise<number> {
    if (!isOtpCodeFormat(code)) throw invalidOtp();
    const otpId = await this.otp.verify(account.id, purpose, code);
    if (otpId === undefined) throw invalidOtp();
    return otpId;
  }

  /**
   * Stores the new hash, bumps token_version, revokes every refresh token
   * and writes the audit row in one transaction; with `otpId`, the code is
   * used up in it too (a concurrent request with the same code loses and
   * gets AUTH_INVALID_OTP).
   */
  private async writePassword(
    account: { readonly id: number; readonly documentId: string },
    newPassword: string,
    write: {
      readonly action: AuditAction;
      readonly meta: ClientMeta;
      readonly otpId?: number;
      readonly status?: AccountStatus;
    },
  ): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await this.runner.run(async (unit) => {
      if (
        write.otpId !== undefined &&
        !(await this.otp.tryConsume(unit, write.otpId))
      ) {
        throw invalidOtp();
      }
      await this.accounts.storePassword(
        unit,
        account.id,
        passwordHash,
        write.status,
      );
      await this.sessions.revokeAll(unit, account.id);
      await this.audit.record(unit, {
        actor: selfActor(account.id),
        action: write.action,
        targetId: account.documentId,
        ip: write.meta.ip,
      });
      // After the commit (D9): old access tokens get 401 on the next request.
      unit.afterCommit(() => this.versions.invalidateAccount(account.id));
    });
  }
}
