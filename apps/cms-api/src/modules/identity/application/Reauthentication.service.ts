import { Inject, Injectable } from '@nestjs/common';

import type { ClientMeta } from '../../../common/types/ClientMeta.entity';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../infrastructure/database/TransactionRunner.port';
import { AccountStatus } from '../../access';
import {
  AUDIT_ACTIONS,
  REAUTH_FAILURE_REASONS,
  type REAUTH_PURPOSES,
  SecurityAuditService,
  selfActor,
} from '../../security-audit';
import { EMAIL_CODE_PURPOSE } from '../domain/Identity.constants';
import {
  invalidTwoFactorCodeWhenSignedIn,
  notSignedIn,
  reauthNeedsTwoFactor,
  wrongCurrentPassword,
} from '../domain/Identity.errors';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
  type TwoFactorAccountRecord,
} from './Identity.port';
import { isOtpCodeFormat, OtpService } from './Otp.service';
import { verifyPassword } from './Password.service';
import { TotpService } from './Totp.service';

type ReauthPurpose = (typeof REAUTH_PURPOSES)[keyof typeof REAUTH_PURPOSES];
type ReauthFailureReason =
  (typeof REAUTH_FAILURE_REASONS)[keyof typeof REAUTH_FAILURE_REASONS];

export interface ReauthenticationInput {
  readonly password: string;
  readonly code: string;
}

/**
 * Re-authentication before a sensitive action (D8, D20): the current password
 * plus a code of the account's active 2FA method. Failures write one
 * standalone `auth.reauth_failed` row; success writes nothing, because the
 * caller audits its own action.
 */
@Injectable()
export class ReauthenticationService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(CORE_TRANSACTION_RUNNER)
    private readonly runner: TransactionRunner,
    private readonly totp: TotpService,
    private readonly otp: OtpService,
    private readonly audit: SecurityAuditService,
  ) {}

  /**
   * @throws 401 when the account is not active, 403 `AUTH_2FA_NOT_ENABLED`
   * when 2FA is off, and 403 for a wrong password or code.
   */
  async confirm(
    accountDocumentId: string,
    input: ReauthenticationInput,
    purpose: ReauthPurpose,
    meta: ClientMeta,
  ): Promise<void> {
    const account = await this.activeAccount(accountDocumentId);
    const method = account.twoFaMethod;
    if (!account.is2faEnabled || method === null) throw reauthNeedsTwoFactor();

    const fail = (reason: ReauthFailureReason) =>
      this.recordFailure(account, purpose, reason, meta);

    if (
      account.passwordHash === null ||
      !(await verifyPassword(account.passwordHash, input.password))
    ) {
      await fail(REAUTH_FAILURE_REASONS.BAD_PASSWORD);
      throw wrongCurrentPassword();
    }
    const isCodeValid =
      method === 'totp'
        ? await this.totp.verifyAccountCode(account, input.code)
        : await this.consumeEmailCode(account.id, input.code);
    if (!isCodeValid) {
      await fail(REAUTH_FAILURE_REASONS.BAD_CODE);
      throw invalidTwoFactorCodeWhenSignedIn();
    }
  }

  private async activeAccount(
    accountDocumentId: string,
  ): Promise<TwoFactorAccountRecord> {
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

  /** True once the emailed code is verified and used up; a spent code is false. */
  private async consumeEmailCode(
    accountId: number,
    code: string,
  ): Promise<boolean> {
    if (!isOtpCodeFormat(code)) return false;
    const otpId = await this.otp.verify(accountId, EMAIL_CODE_PURPOSE, code);
    if (otpId === undefined) return false;
    return this.runner.run((unit) => this.otp.tryConsume(unit, otpId));
  }

  private recordFailure(
    account: TwoFactorAccountRecord,
    purpose: ReauthPurpose,
    reason: ReauthFailureReason,
    meta: ClientMeta,
  ): Promise<void> {
    return this.audit.recordStandalone({
      actor: selfActor(account.id),
      action: AUDIT_ACTIONS.AUTH_REAUTH_FAILED,
      targetId: account.documentId,
      metadata: { purpose, reason },
      ip: meta.ip,
    });
  }
}
