import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  UnauthorizedException,
} from '@nestjs/common';

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
} from '../../common/constants/auth.constants';
import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import {
  type AccountStatus,
  type OtpPurpose,
  type Prisma,
} from '../../generated/prisma/client';
import {
  MAIL_SENDER,
  type MailSender,
} from '../../infrastructure/mail/mail.port';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  AUDIT_ACTIONS,
  type AuditAction,
  REAUTH_FAILURE_REASONS,
} from '../access/security-audit.constants';
import {
  SecurityAuditService,
  selfActor,
} from '../access/security-audit.service';
import { VersionCache } from '../access/version-cache';
import { OTP } from './identity.constants';
import { buildOtpMail } from './otp-mail';
import { isOtpCodeFormat, OtpService } from './otp.service';
import { hashPassword, verifyPassword } from './password-hasher';
import {
  type ChangePasswordRequest,
  isAcceptablePassword,
  type ResetPasswordRequest,
  type SetPasswordRequest,
} from './password.requests';
import { type ClientMeta, RefreshTokenService } from './refresh-token.service';
import {
  RESET_SECOND_FACTOR,
  type ResetSecondFactor,
} from './reset-second-factor';

const LOGGER_CONTEXT = 'PasswordService';
/** Hashed for unknown emails so they cost the same HMAC as a real check. */
const PLACEHOLDER_CODE = '0'.repeat(OTP.DIGITS);

/** Account status -> the code `request-otp` sends (Q3 decision, T12). */
const OTP_PURPOSE_BY_STATUS: Readonly<
  Partial<Record<AccountStatus, OtpPurpose>>
> = {
  invited: 'INVITE_SET_PASSWORD',
  active: 'RESET_PASSWORD',
};

export function invalidOtp(): BadRequestException {
  return new BadRequestException({
    errorCode: AUTH_ERROR_CODES.INVALID_OTP,
    message: AUTH_ERROR_MESSAGES.INVALID_OTP,
  });
}

export function weakPassword(): BadRequestException {
  return new BadRequestException({
    errorCode: AUTH_ERROR_CODES.WEAK_PASSWORD,
    message: AUTH_ERROR_MESSAGES.WEAK_PASSWORD,
  });
}

function totpRequired(): BadRequestException {
  return new BadRequestException({
    errorCode: AUTH_ERROR_CODES.TOTP_REQUIRED,
    message: AUTH_ERROR_MESSAGES.TOTP_REQUIRED,
  });
}

/** T13 Q14: 403, not 401, so the client doesn't take it for an expired session. */
function wrongCurrentPassword(): ForbiddenException {
  return new ForbiddenException({
    errorCode: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    message: AUTH_ERROR_MESSAGES.WRONG_CURRENT_PASSWORD,
  });
}

/**
 * Password lifecycle (SPEC §9, D8, T12): emailed codes for reset and invite,
 * and change while signed in. Every password write bumps `token_version`
 * and revokes every refresh token of the account (§12-10), so all sessions
 * end, the current one included.
 */
@Injectable()
export class PasswordService implements OnApplicationShutdown {
  private readonly logger = new Logger(LOGGER_CONTEXT);
  /** Background code issues still running (awaited on shutdown). */
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(RESET_SECOND_FACTOR)
    private readonly secondFactor: ResetSecondFactor,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
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
      );
    });
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  /** Resolves when every background code issue has finished. */
  async whenIdle(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.whenIdle();
  }

  /** Forgotten password: emailed RESET_PASSWORD code (+ TOTP when enabled). */
  async reset(input: ResetPasswordRequest, meta: ClientMeta): Promise<void> {
    if (!isAcceptablePassword(input.newPassword)) throw weakPassword();
    const account = await this.findForCode(input.email, 'active');
    const otpId = await this.checkCode(account, 'RESET_PASSWORD', input.code);

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
  async set(input: SetPasswordRequest, meta: ClientMeta): Promise<void> {
    if (!isAcceptablePassword(input.newPassword)) throw weakPassword();
    const account = await this.findForCode(input.email, 'invited');
    const otpId = await this.checkCode(
      account,
      'INVITE_SET_PASSWORD',
      input.code,
    );
    await this.writePassword(account, input.newPassword, {
      otpId,
      action: AUDIT_ACTIONS.PASSWORD_SET,
      meta,
      extra: { status: 'active' },
    });
  }

  /** Signed in: needs the current password. Ends every session (Q4 option a). */
  async change(
    accountDocumentId: string,
    input: ChangePasswordRequest,
    meta: ClientMeta,
  ): Promise<void> {
    if (!isAcceptablePassword(input.newPassword)) throw weakPassword();
    const account = await this.prisma.account.findUnique({
      where: { documentId: accountDocumentId },
      select: {
        id: true,
        documentId: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
      },
    });
    if (
      account === null ||
      account.passwordHash === null ||
      account.status !== 'active' ||
      account.deletedAt !== null
    ) {
      throw new UnauthorizedException();
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
    const account = await this.prisma.account.findUnique({
      where: { email },
      select: { id: true, email: true, status: true, deletedAt: true },
    });
    const purpose =
      account === null || account.deletedAt !== null
        ? undefined
        : OTP_PURPOSE_BY_STATUS[account.status];
    if (account === null || purpose === undefined) {
      // Unknown, deleted or disabled: no code, same HMAC work.
      this.otp.hashForUnknownAccount('RESET_PASSWORD', PLACEHOLDER_CODE);
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

  private async findForCode(email: string, status: 'active' | 'invited') {
    const account = await this.prisma.account.findUnique({
      where: { email },
      select: {
        id: true,
        documentId: true,
        status: true,
        deletedAt: true,
        is2faEnabled: true,
        twoFaMethod: true,
      },
    });
    if (
      account === null ||
      account.status !== status ||
      account.deletedAt !== null
    ) {
      this.otp.hashForUnknownAccount('RESET_PASSWORD', PLACEHOLDER_CODE);
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
      readonly extra?: Pick<Prisma.AccountUpdateInput, 'status'>;
    },
  ): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      if (
        write.otpId !== undefined &&
        !(await this.otp.consume(tx, write.otpId))
      ) {
        throw invalidOtp();
      }
      await tx.account.update({
        where: { id: account.id },
        data: {
          ...write.extra,
          passwordHash,
          tokenVersion: { increment: 1 },
        },
      });
      await this.refreshTokens.revokeAllForAccount(tx, account.id);
      await this.audit.record(tx, {
        actor: selfActor(account.id),
        action: write.action,
        targetId: account.documentId,
        ip: write.meta.ip,
      });
    });
    // After the commit (D9): old access tokens get 401 on the next request.
    this.versions.invalidateAccount(account.id);
  }
}
