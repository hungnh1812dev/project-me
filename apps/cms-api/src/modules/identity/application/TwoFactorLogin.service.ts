import { Inject, Injectable } from '@nestjs/common';

import { MS_PER_SECOND } from '../../../common/constants/time.constants';
import type { ClientMeta } from '../../../common/types/ClientMeta.entity';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../infrastructure/database/TransactionRunner.port';
import { AccountStatus } from '../../access';
import {
  AUDIT_ACTIONS,
  SecurityAuditService,
  selfActor,
} from '../../security-audit';
import { EMAIL_CODE_PURPOSE } from '../domain/Identity.constants';
import {
  invalidTempToken,
  invalidTwoFactorCodeAtLogin,
  tooManyRequests,
} from '../domain/Identity.errors';
import {
  AccessTokenService,
  type TwoFactorTempTokenClaims,
} from './AccessToken.service';
import { AuthService, type SessionTokens } from './Auth.service';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './Identity.port';
import { isOtpCodeFormat, OtpService } from './Otp.service';
import { TotpService } from './Totp.service';
import { TwoFactorChallengeStore } from './TwoFactorChallenge.store';
import { TwoFactorEmailCodeService } from './TwoFactorEmailCode.service';

export interface VerifyTwoFactorInput {
  readonly tempToken: string;
  readonly code: string;
}

/**
 * The second login step (SPEC §9, D8) with the temp token from
 * `POST /auth/login`. Turning 2FA on or off is `TwoFactorManagementService`.
 */
@Injectable()
export class TwoFactorLoginService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(CORE_TRANSACTION_RUNNER)
    private readonly runner: TransactionRunner,
    private readonly totp: TotpService,
    private readonly otp: OtpService,
    private readonly challenges: TwoFactorChallengeStore,
    private readonly accessTokens: AccessTokenService,
    private readonly auth: AuthService,
    private readonly audit: SecurityAuditService,
    private readonly emailCodes: TwoFactorEmailCodeService,
  ) {}

  /**
   * Every call counts one of the token's 5 attempts; a correct code uses the
   * token up and starts the session.
   */
  async verifyLogin(
    input: VerifyTwoFactorInput,
    meta: ClientMeta,
  ): Promise<SessionTokens> {
    const claims = this.tempTokenClaims(input.tempToken);
    const expiresAtMs = claims.exp * MS_PER_SECOND;
    const attempt = this.challenges.attempt(claims.jti, expiresAtMs);
    // Challenge store full (fail closed): same body as the throttle guard.
    if (attempt === 'refused') throw tooManyRequests();
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
      throw invalidTwoFactorCodeAtLogin();
    }
    if (!this.challenges.tryMarkUsed(claims.jti, expiresAtMs)) {
      throw invalidTempToken();
    }
    return this.auth.startSession(account, meta, account.twoFaMethod);
  }

  /** Emails the login code of an email-2FA account; no-op for TOTP. */
  async emailChallenge(rawTempToken: string, meta: ClientMeta): Promise<void> {
    const claims = this.tempTokenClaims(rawTempToken);
    if (!this.challenges.isLive(claims.jti)) throw invalidTempToken();
    const account = await this.challengeAccount(claims);
    if (account.twoFaMethod !== 'email') return;
    await this.emailCodes.send(account.id, account.email, meta);
  }

  private tempTokenClaims(rawTempToken: string): TwoFactorTempTokenClaims {
    const claims = this.accessTokens.verifyTwoFactorTempToken(rawTempToken);
    if (claims === undefined) throw invalidTempToken();
    return claims;
  }

  /** The temp token's account, still active, same token_version, 2FA on. */
  private async challengeAccount(claims: TwoFactorTempTokenClaims) {
    const account = await this.accounts.findTwoFactorAccount(claims.sub);
    if (
      account === null ||
      account.status !== AccountStatus.active ||
      account.deletedAt !== null ||
      account.tokenVersion !== claims.tv ||
      !account.is2faEnabled ||
      account.twoFaMethod === null
    ) {
      throw invalidTempToken();
    }
    return { ...account, twoFaMethod: account.twoFaMethod };
  }

  /** Checks and uses up an emailed code. */
  private async tryEmailCode(
    accountId: number,
    code: string,
  ): Promise<boolean> {
    if (!isOtpCodeFormat(code)) return false;
    const otpId = await this.otp.verify(accountId, EMAIL_CODE_PURPOSE, code);
    if (otpId === undefined) return false;
    return this.runner.run((unit) => this.otp.tryConsume(unit, otpId));
  }
}
