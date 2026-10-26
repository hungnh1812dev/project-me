import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  EMAIL_CODE_PURPOSE,
} from './domain/Identity.constants';
import { type Prisma, type TwoFaMethod } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  AUDIT_ACTIONS,
  REAUTH_FAILURE_REASONS,
  TWO_FACTOR_OPERATIONS,
} from '../security-audit';
import { SecurityAuditService, selfActor } from '../security-audit';
import { SecretBox } from './crypto/secret-box';
import { isOtpCodeFormat, OtpService } from './otp.service';
import { verifyPassword } from './password-hasher';
import { type ClientMeta } from '../../common/http/client-meta';
import { TotpService } from './totp.service';
import { TwoFactorEmailCodeSender } from './two-factor-email-code.sender';
import {
  invalidTwoFactorCode,
  TWO_FACTOR_ACCOUNT_SELECT,
} from './two-factor.shared';
import {
  type DisableTwoFactorRequest,
  type EnableTwoFactorRequest,
} from './two-factor.requests';

type TwoFactorOperation =
  (typeof TWO_FACTOR_OPERATIONS)[keyof typeof TWO_FACTOR_OPERATIONS];
type ReauthFailureReason =
  (typeof REAUTH_FAILURE_REASONS)[keyof typeof REAUTH_FAILURE_REASONS];

/** The account an audit row names (actor and target are the same here). */
interface AuditedAccount {
  readonly id: number;
  readonly documentId: string;
}
/** `POST /auth/2fa/totp/setup`: the QR is rendered by the client. */
export interface TotpSetupResponse {
  readonly otpauthUri: string;
  /** Base32 secret for "can't scan? enter this key". */
  readonly secret: string;
}

/** Fields written when 2FA goes off or switches to email. */
const CLEARED_TOTP = {
  totpSecretEnc: null,
  totpSecretKid: null,
  totpLastStep: null,
} as const;

/** A signed-in re-auth failure is 403, so the client keeps its session. */
function wrongPassword(): ForbiddenException {
  return new ForbiddenException({
    errorCode: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    message: AUTH_ERROR_MESSAGES.WRONG_CURRENT_PASSWORD,
  });
}

function alreadyEnabled(): ConflictException {
  return new ConflictException({
    errorCode: AUTH_ERROR_CODES.TWO_FACTOR_ALREADY_ENABLED,
    message: AUTH_ERROR_MESSAGES.TWO_FACTOR_ALREADY_ENABLED,
  });
}

function notEnabled(): ConflictException {
  return new ConflictException({
    errorCode: AUTH_ERROR_CODES.TWO_FACTOR_NOT_ENABLED,
    message: AUTH_ERROR_MESSAGES.TWO_FACTOR_NOT_ENABLED,
  });
}

function setupRequired(): ConflictException {
  return new ConflictException({
    errorCode: AUTH_ERROR_CODES.TWO_FACTOR_SETUP_REQUIRED,
    message: AUTH_ERROR_MESSAGES.TWO_FACTOR_SETUP_REQUIRED,
  });
}

/**
 * Two-factor management (SPEC §9, D8): TOTP setup, enable and disable
 * (password + code) for the signed-in account. The second login step is
 * `TwoFactorLoginService`.
 */
@Injectable()
export class TwoFactorManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly totp: TotpService,
    private readonly secretBox: SecretBox,
    private readonly otp: OtpService,
    private readonly audit: SecurityAuditService,
    private readonly emailCodes: TwoFactorEmailCodeSender,
  ) {}

  /**
   * New pending TOTP secret (replaces any earlier one). It is used only once
   * `enable` checks a first code against it.
   */
  async setupTotp(accountDocumentId: string): Promise<TotpSetupResponse> {
    const account = await this.signedInAccount(accountDocumentId);
    if (account.is2faEnabled) throw alreadyEnabled();

    const secret = this.totp.createSecret();
    const sealed = this.secretBox.seal(secret, account.documentId);
    const stored = await this.prisma.account.updateMany({
      where: { id: account.id, is2faEnabled: false },
      data: {
        totpSecretEnc: sealed.ciphertext,
        totpSecretKid: sealed.kid,
        totpLastStep: null,
      },
    });
    if (stored.count === 0) throw alreadyEnabled();
    return { otpauthUri: this.totp.otpauthUri(account.email, secret), secret };
  }

  /** D8: current password plus a first valid code of the chosen method. */
  async enable(
    accountDocumentId: string,
    input: EnableTwoFactorRequest,
    meta: ClientMeta,
  ): Promise<void> {
    const account = await this.signedInAccount(accountDocumentId);
    if (account.is2faEnabled) throw alreadyEnabled();
    const operation = TWO_FACTOR_OPERATIONS.ENABLE;
    await this.checkPassword(account, input.password, operation, meta);
    const badCode = async (): Promise<HttpException> => {
      await this.manageFailed(
        account,
        operation,
        REAUTH_FAILURE_REASONS.BAD_CODE,
        meta,
      );
      return invalidTwoFactorCode(HttpStatus.FORBIDDEN);
    };

    if (input.method === 'totp') {
      const secret = this.totp.openSecret(account);
      if (secret === undefined) throw setupRequired();
      const step = await this.totp.matchStep(secret, input.code, null);
      if (step === undefined) throw await badCode();
      const wasEnabled = await this.prisma.$transaction(async (tx) => {
        const written = await tx.account.updateMany({
          // Same pending secret: a setup in between makes this code stale.
          where: {
            id: account.id,
            is2faEnabled: false,
            totpSecretEnc: account.totpSecretEnc,
          },
          data: {
            is2faEnabled: true,
            twoFaMethod: 'totp',
            totpLastStep: step,
          },
        });
        if (written.count > 0) {
          await this.recordChange(tx, account, 'totp', true, meta);
        }
        return written.count > 0;
      });
      if (!wasEnabled) throw await badCode();
      return;
    }

    await this.useEmailCode(account.id, input.code, {
      where: { is2faEnabled: false },
      accountPatch: {
        is2faEnabled: true,
        twoFaMethod: 'email',
        ...CLEARED_TOTP,
      },
      onMissed: alreadyEnabled,
      onBadCode: badCode,
      alsoInTransaction: (tx) =>
        this.recordChange(tx, account, 'email', true, meta),
    });
  }

  /** D8: current password plus a code of the active method. */
  async disable(
    accountDocumentId: string,
    input: DisableTwoFactorRequest,
    meta: ClientMeta,
  ): Promise<void> {
    const account = await this.signedInAccount(accountDocumentId);
    const method = account.twoFaMethod;
    if (!account.is2faEnabled || method === null) {
      throw notEnabled();
    }
    const operation = TWO_FACTOR_OPERATIONS.DISABLE;
    await this.checkPassword(account, input.password, operation, meta);
    const badCode = async (): Promise<HttpException> => {
      await this.manageFailed(
        account,
        operation,
        REAUTH_FAILURE_REASONS.BAD_CODE,
        meta,
      );
      return invalidTwoFactorCode(HttpStatus.FORBIDDEN);
    };

    const off = { is2faEnabled: false, twoFaMethod: null, ...CLEARED_TOTP };
    if (method === 'totp') {
      if (!(await this.totp.verifyAccountCode(account, input.code))) {
        throw await badCode();
      }
      await this.prisma.$transaction(async (tx) => {
        const disabled = await tx.account.updateMany({
          where: { id: account.id, is2faEnabled: true },
          data: off,
        });
        if (disabled.count === 0) throw notEnabled();
        await this.recordChange(tx, account, method, false, meta);
      });
      return;
    }
    await this.useEmailCode(account.id, input.code, {
      where: { is2faEnabled: true, twoFaMethod: 'email' },
      accountPatch: off,
      onMissed: notEnabled,
      onBadCode: badCode,
      alsoInTransaction: (tx) =>
        this.recordChange(tx, account, method, false, meta),
    });
  }

  /**
   * Emails a LOGIN_2FA_EMAIL code to the signed-in account, for enabling or
   * disabling email 2FA. Nothing is sent while TOTP is on (it has no use).
   */
  async sendEmailCode(
    accountDocumentId: string,
    meta: ClientMeta,
  ): Promise<void> {
    const account = await this.signedInAccount(accountDocumentId);
    if (account.is2faEnabled && account.twoFaMethod !== 'email') return;
    await this.emailCodes.send(account.id, account.email, meta);
  }

  private async signedInAccount(accountDocumentId: string) {
    const account = await this.prisma.account.findUnique({
      where: { documentId: accountDocumentId },
      select: TWO_FACTOR_ACCOUNT_SELECT,
    });
    if (
      account === null ||
      account.status !== 'active' ||
      account.deletedAt !== null
    ) {
      throw new UnauthorizedException();
    }
    return account;
  }

  private async checkPassword(
    account: AuditedAccount & { readonly passwordHash: string | null },
    password: string,
    operation: TwoFactorOperation,
    meta: ClientMeta,
  ): Promise<void> {
    if (
      account.passwordHash === null ||
      !(await verifyPassword(account.passwordHash, password))
    ) {
      await this.manageFailed(
        account,
        operation,
        REAUTH_FAILURE_REASONS.BAD_PASSWORD,
        meta,
      );
      throw wrongPassword();
    }
  }

  /** `two_factor.manage_failed`: standalone, nothing else is written. */
  private manageFailed(
    account: AuditedAccount,
    operation: TwoFactorOperation,
    reason: ReauthFailureReason,
    meta: ClientMeta,
  ): Promise<void> {
    return this.audit.recordStandalone({
      actor: selfActor(account.id),
      action: AUDIT_ACTIONS.TWO_FACTOR_MANAGE_FAILED,
      targetId: account.documentId,
      metadata: { operation, reason },
      ip: meta.ip,
    });
  }

  /** `two_factor.enabled` / `.disabled` in the transaction of the change. */
  private recordChange(
    tx: Prisma.TransactionClient,
    account: AuditedAccount,
    method: TwoFaMethod,
    isEnabled: boolean,
    meta: ClientMeta,
  ): Promise<void> {
    return this.audit.record(tx, {
      actor: selfActor(account.id),
      action: isEnabled
        ? AUDIT_ACTIONS.TWO_FACTOR_ENABLED
        : AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
      targetId: account.documentId,
      metadata: { method },
      ip: meta.ip,
    });
  }

  /**
   * Enable/disable with an emailed code: the code is used up, the account
   * written and `alsoInTransaction` run (the audit row) in one transaction.
   * `where` guards against a concurrent change; when it matches nothing,
   * `onMissed` is thrown. A wrong or spent code throws `onBadCode()`.
   */
  private async useEmailCode(
    accountId: number,
    code: string,
    change: {
      readonly where: { is2faEnabled: boolean; twoFaMethod?: TwoFaMethod };
      readonly accountPatch: {
        is2faEnabled: boolean;
        twoFaMethod: TwoFaMethod | null;
        totpSecretEnc: null;
        totpSecretKid: null;
        totpLastStep: null;
      };
      readonly onMissed: () => HttpException;
      readonly onBadCode: () => Promise<HttpException>;
      readonly alsoInTransaction: (
        tx: Prisma.TransactionClient,
      ) => Promise<void>;
    },
  ): Promise<void> {
    if (!isOtpCodeFormat(code)) throw await change.onBadCode();
    const otpId = await this.otp.verify(accountId, EMAIL_CODE_PURPOSE, code);
    if (otpId === undefined) throw await change.onBadCode();
    const consumed = await this.prisma.$transaction(async (tx) => {
      if (!(await this.otp.tryConsume(tx, otpId))) return false;
      const written = await tx.account.updateMany({
        where: { id: accountId, ...change.where },
        data: change.accountPatch,
      });
      if (written.count === 0) throw change.onMissed();
      await change.alsoInTransaction(tx);
      return true;
    });
    if (!consumed) throw await change.onBadCode();
  }
}
