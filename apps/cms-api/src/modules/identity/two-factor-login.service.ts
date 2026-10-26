import {
  HttpStatus,
  Injectable,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  EMAIL_CODE_PURPOSE,
} from './domain/Identity.constants';
import { ERROR_CODES } from '../../common/constants/error.constants';
import { RATE_LIMIT_MESSAGE } from '../../common/constants/limits.constants';
import { MS_PER_SECOND } from '../../common/constants/time.constants';
import { type ClientMeta } from '../../common/http/client-meta';
import { unitOfWorkFromPrismaTx } from '../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS } from '../security-audit';
import { SecurityAuditService, selfActor } from '../security-audit';
import {
  AccessTokenService,
  type TwoFactorTempTokenClaims,
} from './application/AccessToken.service';
import { AuthService, type SessionTokens } from './auth.service';
import { isOtpCodeFormat, OtpService } from './application/Otp.service';
import { TotpService } from './application/Totp.service';
import { TwoFactorChallengeStore } from './application/TwoFactorChallenge.store';
import { TwoFactorEmailCodeSender } from './two-factor-email-code.sender';
import { TWO_FACTOR_ACCOUNT_SELECT } from './adapters/PrismaAccount.repository';
import { invalidTwoFactorCode } from './two-factor.shared';
import { type VerifyTwoFactorRequest } from './two-factor.requests';

function invalidTempToken(): UnauthorizedException {
  return new UnauthorizedException({
    errorCode: AUTH_ERROR_CODES.INVALID_TEMP_TOKEN,
    message: AUTH_ERROR_MESSAGES.INVALID_TEMP_TOKEN,
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
 * The second login step (SPEC §9, D8) with the temp token from
 * `POST /auth/login`. Turning 2FA on or off is `TwoFactorManagementService`.
 */
@Injectable()
export class TwoFactorLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly totp: TotpService,
    private readonly otp: OtpService,
    private readonly challenges: TwoFactorChallengeStore,
    private readonly accessTokens: AccessTokenService,
    private readonly auth: AuthService,
    private readonly audit: SecurityAuditService,
    private readonly emailCodes: TwoFactorEmailCodeSender,
  ) {}

  /**
   * Every call counts one of the token's 5 attempts; a correct code uses the
   * token up and starts the session.
   */
  async verifyLogin(
    input: VerifyTwoFactorRequest,
    meta: ClientMeta,
  ): Promise<SessionTokens> {
    const claims = this.tempTokenClaims(input.tempToken);
    const expiresAtMs = claims.exp * MS_PER_SECOND;
    const attempt = this.challenges.attempt(claims.jti, expiresAtMs);
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
    if (!this.challenges.tryMarkUsed(claims.jti, expiresAtMs)) {
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
    await this.emailCodes.send(account.id, account.email, meta);
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

  /** Checks and uses up an emailed code. */
  private async tryEmailCode(
    accountId: number,
    code: string,
  ): Promise<boolean> {
    if (!isOtpCodeFormat(code)) return false;
    const otpId = await this.otp.verify(accountId, EMAIL_CODE_PURPOSE, code);
    if (otpId === undefined) return false;
    return this.prisma.$transaction((tx) =>
      this.otp.tryConsume(unitOfWorkFromPrismaTx(tx), otpId),
    );
  }
}
