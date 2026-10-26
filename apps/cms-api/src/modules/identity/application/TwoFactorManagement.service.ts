import { Inject, Injectable } from '@nestjs/common';

import type { DomainError } from '../../../common/errors/Domain.errors';
import type { ClientMeta } from '../../../common/types/ClientMeta.entity';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import { AccountStatus } from '../../access';
import {
  AUDIT_ACTIONS,
  REAUTH_FAILURE_REASONS,
  SecurityAuditService,
  selfActor,
  TWO_FACTOR_OPERATIONS,
} from '../../security-audit';
import {
  EMAIL_CODE_PURPOSE,
  type TwoFaMethod,
} from '../domain/Identity.constants';
import {
  invalidTwoFactorCodeWhenSignedIn,
  notSignedIn,
  twoFactorAlreadyEnabled,
  twoFactorNotEnabled,
  twoFactorSetupRequired,
  wrongCurrentPassword,
} from '../domain/Identity.errors';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
  type TwoFactorChange,
} from './Identity.port';
import { isOtpCodeFormat, OtpService } from './Otp.service';
import { verifyPassword } from './Password.service';
import { SecretBox } from './SecretBox.service';
import { TotpService } from './Totp.service';
import { TwoFactorEmailCodeService } from './TwoFactorEmailCode.service';

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

export interface EnableTwoFactorInput {
  readonly method: 'totp' | 'email';
  readonly password: string;
  readonly code: string;
}

export interface DisableTwoFactorInput {
  readonly password: string;
  readonly code: string;
}

/**
 * Two-factor management (SPEC §9, D8): TOTP setup, enable and disable
 * (password + code) for the signed-in account. The second login step is
 * `TwoFactorLoginService`.
 */
@Injectable()
export class TwoFactorManagementService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(CORE_TRANSACTION_RUNNER)
    private readonly runner: TransactionRunner,
    private readonly totp: TotpService,
    private readonly secretBox: SecretBox,
    private readonly otp: OtpService,
    private readonly audit: SecurityAuditService,
    private readonly emailCodes: TwoFactorEmailCodeService,
  ) {}

  /**
   * New pending TOTP secret (replaces any earlier one). It is used only once
   * `enable` checks a first code against it.
   */
  async setupTotp(accountDocumentId: string): Promise<TotpSetupResponse> {
    const account = await this.signedInAccount(accountDocumentId);
    if (account.is2faEnabled) throw twoFactorAlreadyEnabled();

    const secret = this.totp.createSecret();
    const sealed = this.secretBox.seal(secret, account.documentId);
    if (!(await this.accounts.storePendingTotp(account.id, sealed))) {
      throw twoFactorAlreadyEnabled();
    }
    return { otpauthUri: this.totp.otpauthUri(account.email, secret), secret };
  }

  /** D8: current password plus a first valid code of the chosen method. */
  async enable(
    accountDocumentId: string,
    input: EnableTwoFactorInput,
    meta: ClientMeta,
  ): Promise<void> {
    const account = await this.signedInAccount(accountDocumentId);
    if (account.is2faEnabled) throw twoFactorAlreadyEnabled();
    const operation = TWO_FACTOR_OPERATIONS.ENABLE;
    await this.checkPassword(account, input.password, operation, meta);
    const badCode = () => this.badCode(account, operation, meta);

    if (input.method === 'totp') {
      const secret = this.totp.openSecret(account);
      const sealedSecret = account.totpSecretEnc;
      if (secret === undefined || sealedSecret === null) {
        throw twoFactorSetupRequired();
      }
      const step = await this.totp.matchStep(secret, input.code, null);
      if (step === undefined) throw await badCode();
      const wasEnabled = await this.runner.run(async (unit) => {
        const written = await this.accounts.changeTwoFactor(unit, {
          accountId: account.id,
          // Same pending secret: a setup in between makes this code stale.
          expect: { isEnabled: false, sealedSecret },
          next: { isEnabled: true, method: 'totp', lastStep: step },
        });
        if (written) await this.recordChange(unit, account, 'totp', true, meta);
        return written;
      });
      if (!wasEnabled) throw await badCode();
      return;
    }

    await this.useEmailCode(account.id, input.code, {
      change: {
        accountId: account.id,
        expect: { isEnabled: false },
        next: { isEnabled: true, method: 'email' },
      },
      onMissed: twoFactorAlreadyEnabled,
      onBadCode: badCode,
      alsoInTransaction: (unit) =>
        this.recordChange(unit, account, 'email', true, meta),
    });
  }

  /** D8: current password plus a code of the active method. */
  async disable(
    accountDocumentId: string,
    input: DisableTwoFactorInput,
    meta: ClientMeta,
  ): Promise<void> {
    const account = await this.signedInAccount(accountDocumentId);
    const method = account.twoFaMethod;
    if (!account.is2faEnabled || method === null) {
      throw twoFactorNotEnabled();
    }
    const operation = TWO_FACTOR_OPERATIONS.DISABLE;
    await this.checkPassword(account, input.password, operation, meta);
    const badCode = () => this.badCode(account, operation, meta);

    if (method === 'totp') {
      if (!(await this.totp.verifyAccountCode(account, input.code))) {
        throw await badCode();
      }
      await this.runner.run(async (unit) => {
        const disabled = await this.accounts.changeTwoFactor(unit, {
          accountId: account.id,
          expect: { isEnabled: true },
          next: { isEnabled: false },
        });
        if (!disabled) throw twoFactorNotEnabled();
        await this.recordChange(unit, account, method, false, meta);
      });
      return;
    }
    await this.useEmailCode(account.id, input.code, {
      change: {
        accountId: account.id,
        expect: { isEnabled: true, method: 'email' },
        next: { isEnabled: false },
      },
      onMissed: twoFactorNotEnabled,
      onBadCode: badCode,
      alsoInTransaction: (unit) =>
        this.recordChange(unit, account, method, false, meta),
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
    const account = await this.accounts.findTwoFactorAccount(accountDocumentId);
    if (
      account === null ||
      account.status !== AccountStatus.active ||
      account.deletedAt !== null
    ) {
      throw notSignedIn();
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
      // A signed-in re-auth failure is 403, so the client keeps its session.
      throw wrongCurrentPassword();
    }
  }

  /** Audits a wrong code, then returns the 403 for the caller to throw. */
  private async badCode(
    account: AuditedAccount,
    operation: TwoFactorOperation,
    meta: ClientMeta,
  ): Promise<DomainError> {
    await this.manageFailed(
      account,
      operation,
      REAUTH_FAILURE_REASONS.BAD_CODE,
      meta,
    );
    return invalidTwoFactorCodeWhenSignedIn();
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
    unit: UnitOfWork,
    account: AuditedAccount,
    method: TwoFaMethod,
    isEnabled: boolean,
    meta: ClientMeta,
  ): Promise<void> {
    return this.audit.record(unit, {
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
   * `change.expect` guards against a concurrent change; when it no longer
   * matches, `onMissed` is thrown. A wrong or spent code throws `onBadCode()`.
   */
  private async useEmailCode(
    accountId: number,
    code: string,
    step: {
      readonly change: TwoFactorChange;
      readonly onMissed: () => DomainError;
      readonly onBadCode: () => Promise<DomainError>;
      readonly alsoInTransaction: (unit: UnitOfWork) => Promise<void>;
    },
  ): Promise<void> {
    if (!isOtpCodeFormat(code)) throw await step.onBadCode();
    const otpId = await this.otp.verify(accountId, EMAIL_CODE_PURPOSE, code);
    if (otpId === undefined) throw await step.onBadCode();
    const consumed = await this.runner.run(async (unit) => {
      if (!(await this.otp.tryConsume(unit, otpId))) return false;
      if (!(await this.accounts.changeTwoFactor(unit, step.change))) {
        throw step.onMissed();
      }
      await step.alsoInTransaction(unit);
      return true;
    });
    if (!consumed) throw await step.onBadCode();
  }
}
