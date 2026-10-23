import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
} from '../../common/constants/auth.constants';
import { ERROR_CODES } from '../../common/constants/error.constants';
import {
  MS_PER_SECOND,
  RATE_LIMIT_MESSAGE,
} from '../../common/constants/limits.constants';
import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { type Prisma, type TwoFaMethod } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  MAIL_SENDER,
  type MailSender,
} from '../../infrastructure/mail/mail.port';
import {
  AUDIT_ACTIONS,
  REAUTH_FAILURE_REASONS,
  TWO_FACTOR_OPERATIONS,
} from '../security-audit/security-audit.constants';
import {
  SecurityAuditService,
  selfActor,
} from '../security-audit/security-audit.service';
import {
  AccessTokenService,
  type TwoFactorTempTokenClaims,
} from './access-token.service';
import { AuthService, type SessionTokens } from './auth.service';
import { SecretBox } from './crypto/secret-box';
import { buildOtpMail } from './otp-mail';
import { isOtpCodeFormat, OtpService } from './otp.service';
import { verifyPassword } from './password-hasher';
import { type ClientMeta } from '../../common/http/client-meta';
import { TOTP_ACCOUNT_SELECT, TotpService } from './totp.service';
import { TwoFactorChallengeStore } from './two-factor-challenge.store';
import {
  type DisableTwoFactorRequest,
  type EnableTwoFactorRequest,
  type VerifyTwoFactorRequest,
} from './two-factor.requests';

const LOGGER_CONTEXT = 'TwoFactorService';

type TwoFactorOperation =
  (typeof TWO_FACTOR_OPERATIONS)[keyof typeof TWO_FACTOR_OPERATIONS];
type ReauthFailureReason =
  (typeof REAUTH_FAILURE_REASONS)[keyof typeof REAUTH_FAILURE_REASONS];

/** The account an audit row names (actor and target are the same here). */
interface AuditedAccount {
  readonly id: number;
  readonly documentId: string;
}
const EMAIL_CODE_PURPOSE = 'LOGIN_2FA_EMAIL';

/** `POST /auth/2fa/totp/setup`: the QR is rendered by the client (T13 Q5). */
export interface TotpSetupResponse {
  readonly otpauthUri: string;
  /** Base32 secret for "can't scan? enter this key". */
  readonly secret: string;
}

/** Account columns every 2FA operation reads. */
const TWO_FACTOR_ACCOUNT_SELECT = {
  ...TOTP_ACCOUNT_SELECT,
  email: true,
  passwordHash: true,
  status: true,
  deletedAt: true,
  tokenVersion: true,
  is2faEnabled: true,
  twoFaMethod: true,
  role: { select: { policyVersion: true } },
} as const;

/** Fields written when 2FA goes off or switches to email. */
const CLEARED_TOTP = {
  totpSecretEnc: null,
  totpSecretKid: null,
  totpLastStep: null,
} as const;

function invalidTwoFactorCode(status: HttpStatus): HttpException {
  return new HttpException(
    {
      errorCode: AUTH_ERROR_CODES.INVALID_2FA_CODE,
      message: AUTH_ERROR_MESSAGES.INVALID_2FA_CODE,
    },
    status,
  );
}

function invalidTempToken(): UnauthorizedException {
  return new UnauthorizedException({
    errorCode: AUTH_ERROR_CODES.INVALID_TEMP_TOKEN,
    message: AUTH_ERROR_MESSAGES.INVALID_TEMP_TOKEN,
  });
}

/** T13 Q14: a signed-in re-auth failure is 403, so the client keeps its session. */
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

/** Challenge store full (fail closed): same body as the throttle guard. */
function challengeStoreFull(): HttpException {
  return new HttpException(
    { errorCode: ERROR_CODES.TOO_MANY_REQUESTS, message: RATE_LIMIT_MESSAGE },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * Two-factor authentication (SPEC §9, D8, T13): TOTP setup, enable and
 * disable (password + code) for the signed-in account, and the second login
 * step with the temp token from `POST /auth/login`. Email 2FA codes are
 * LOGIN_2FA_EMAIL OTPs (T13 Q9).
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(LOGGER_CONTEXT);

  constructor(
    private readonly prisma: PrismaService,
    private readonly totp: TotpService,
    private readonly secretBox: SecretBox,
    private readonly otp: OtpService,
    private readonly challenges: TwoFactorChallengeStore,
    private readonly accessTokens: AccessTokenService,
    private readonly auth: AuthService,
    private readonly audit: SecurityAuditService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
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
      const enabled = await this.prisma.$transaction(async (tx) => {
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
      if (!enabled) throw await badCode();
      return;
    }

    await this.useEmailCode(account.id, input.code, {
      where: { is2faEnabled: false },
      data: { is2faEnabled: true, twoFaMethod: 'email', ...CLEARED_TOTP },
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
      data: off,
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
    await this.sendCode(account.id, account.email, meta);
  }

  /**
   * Second login step. Every call counts one of the token's 5 attempts; a
   * correct code uses the token up and starts the session.
   */
  async verifyLogin(
    input: VerifyTwoFactorRequest,
    meta: ClientMeta,
  ): Promise<SessionTokens> {
    const claims = this.tempTokenClaims(input.tempToken);
    const expiresAt = claims.exp * MS_PER_SECOND;
    const attempt = this.challenges.attempt(claims.jti, expiresAt);
    if (attempt === 'refused') throw challengeStoreFull();
    if (attempt === 'exhausted') throw invalidTempToken();

    const account = await this.challengeAccount(claims);
    const ok =
      account.twoFaMethod === 'totp'
        ? await this.totp.verifyAccountCode(account, input.code)
        : await this.tryEmailCode(account.id, input.code);
    if (!ok) {
      // No write to share a transaction with: a standalone row.
      await this.audit.recordStandalone({
        actor: selfActor(account.id),
        action: AUDIT_ACTIONS.TWO_FACTOR_VERIFY_FAILED,
        targetId: account.documentId,
        metadata: { method: account.twoFaMethod },
        ip: meta.ip,
      });
      throw invalidTwoFactorCode(HttpStatus.UNAUTHORIZED);
    }
    if (!this.challenges.markUsed(claims.jti, expiresAt)) {
      throw invalidTempToken();
    }
    return this.auth.startSession(
      {
        id: account.id,
        documentId: account.documentId,
        tokenVersion: account.tokenVersion,
        policyVersion: account.role.policyVersion,
      },
      meta,
      account.twoFaMethod,
    );
  }

  /** Emails the login code of an email-2FA account; no-op for TOTP. */
  async emailChallenge(rawTempToken: string, meta: ClientMeta): Promise<void> {
    const claims = this.tempTokenClaims(rawTempToken);
    if (!this.challenges.isLive(claims.jti)) throw invalidTempToken();
    const account = await this.challengeAccount(claims);
    if (account.twoFaMethod !== 'email') return;
    await this.sendCode(account.id, account.email, meta);
  }

  private tempTokenClaims(rawTempToken: string): TwoFactorTempTokenClaims {
    const claims = this.accessTokens.verifyTwoFactorTempToken(rawTempToken);
    if (claims === undefined) throw invalidTempToken();
    return claims;
  }

  /** The temp token's account, still active, same token_version, 2FA on. */
  private async challengeAccount(claims: TwoFactorTempTokenClaims) {
    const account = await this.prisma.account.findUnique({
      where: { documentId: claims.sub },
      select: TWO_FACTOR_ACCOUNT_SELECT,
    });
    if (
      account === null ||
      account.status !== 'active' ||
      account.deletedAt !== null ||
      account.tokenVersion !== claims.tv ||
      !account.is2faEnabled ||
      account.twoFaMethod === null
    ) {
      throw invalidTempToken();
    }
    return { ...account, twoFaMethod: account.twoFaMethod };
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
    enabled: boolean,
    meta: ClientMeta,
  ): Promise<void> {
    return this.audit.record(tx, {
      actor: selfActor(account.id),
      action: enabled
        ? AUDIT_ACTIONS.TWO_FACTOR_ENABLED
        : AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
      targetId: account.documentId,
      metadata: { method },
      ip: meta.ip,
    });
  }

  /** Login step: checks and uses up an emailed code. */
  private async tryEmailCode(
    accountId: number,
    code: string,
  ): Promise<boolean> {
    if (!isOtpCodeFormat(code)) return false;
    const otpId = await this.otp.verify(accountId, EMAIL_CODE_PURPOSE, code);
    if (otpId === undefined) return false;
    return this.prisma.$transaction((tx) => this.otp.consume(tx, otpId));
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
      readonly data: {
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
      if (!(await this.otp.consume(tx, otpId))) return false;
      const written = await tx.account.updateMany({
        where: { id: accountId, ...change.where },
        data: change.data,
      });
      if (written.count === 0) throw change.onMissed();
      await change.alsoInTransaction(tx);
      return true;
    });
    if (!consumed) throw await change.onBadCode();
  }

  /** Issues a LOGIN_2FA_EMAIL code (429 past the hourly cap) and mails it. */
  private async sendCode(
    accountId: number,
    email: string,
    meta: ClientMeta,
  ): Promise<void> {
    const code = await this.otp.issue(accountId, EMAIL_CODE_PURPOSE, {
      ip: meta.ip,
    });
    try {
      await this.mail.send(
        buildOtpMail(
          email,
          EMAIL_CODE_PURPOSE,
          code,
          this.config.cors.allowedOrigins[0],
        ),
      );
    } catch (error) {
      // Name and code only: SMTP error messages can echo the recipient.
      const name = error instanceof Error ? error.name : typeof error;
      const errorCode = (error as { code?: unknown } | null)?.code;
      this.logger.warn(
        `2FA code not delivered: ${name}${typeof errorCode === 'string' ? ` (${errorCode})` : ''}`,
      );
      throw new ServiceUnavailableException();
    }
  }
}
