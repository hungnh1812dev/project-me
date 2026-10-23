import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../common/clock';
import { ERROR_CODES } from '../../common/constants/error.constants';
import {
  MS_PER_SECOND,
  RATE_LIMIT_MESSAGE,
} from '../../common/constants/limits.constants';
import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { type OtpPurpose, type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS } from '../security-audit/security-audit.constants';
import {
  type AuditActor,
  SecurityAuditService,
  selfActor,
} from '../security-audit/security-audit.service';
import { OTP } from './identity.constants';

type Tx = Prisma.TransactionClient;

const OTP_CODE_PATTERN = new RegExp(`^\\d{${OTP.DIGITS}}$`);
const OTP_CODE_SPACE = 10 ** OTP.DIGITS;
/** Stands in for the account id when hashing for an unknown email. */
const DUMMY_ACCOUNT_ID = 0;

/** Who asked for a code and where from (the `auth.otp_issued` row). */
export interface OtpIssueOptions {
  /** Default: the account itself. An invite names the inviter. */
  readonly actor?: AuditActor | undefined;
  readonly ip?: string | undefined;
  /** Issue inside the caller's transaction (e.g. with the invited account). */
  readonly tx?: Tx | undefined;
}

/** True when `code` has the shape of an OTP (exactly 6 digits). */
export function isOtpCodeFormat(code: string): boolean {
  return OTP_CODE_PATTERN.test(code);
}

/**
 * D8: HMAC-SHA256 of the code under `OTP_PEPPER`, bound to the account and
 * the purpose, so a code (or a leaked row) is useless for anything else.
 */
export function otpHmac(
  pepper: string,
  accountId: number,
  purpose: OtpPurpose,
  code: string,
): string {
  return createHmac(OTP.HMAC_ALGORITHM, pepper)
    .update(`${accountId}:${purpose}:${code}`)
    .digest('hex');
}

/** 429 for a 6th code within the issue window (§12-9). Same body as the throttle guard. */
export function otpIssueLimitExceeded(): HttpException {
  return new HttpException(
    { errorCode: ERROR_CODES.TOO_MANY_REQUESTS, message: RATE_LIMIT_MESSAGE },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * One-time codes in `otp_codes` (D8, SPEC §6, §12-9): 6 digits, 300 s TTL,
 * 5 checks per code, 5 codes per account per hour across all purposes, and
 * single use. Only the HMAC is stored; the raw code leaves through the
 * return value of `issue` and nowhere else.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: SecurityAuditService,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
  ) {}

  /**
   * Creates a code and returns it in clear (for the email only). Earlier
   * unused codes of the same account and purpose stop working. Throws 429
   * when the account already got 5 codes within the window. Writes the
   * `auth.otp_issued` row (purpose only, never the code) in the same
   * transaction (D15).
   */
  issue(
    accountId: number,
    purpose: OtpPurpose,
    options: OtpIssueOptions = {},
  ): Promise<string> {
    const pepper = this.pepper();
    const now = this.clock.now();
    const code = randomInt(0, OTP_CODE_SPACE)
      .toString()
      .padStart(OTP.DIGITS, '0');

    const run = async (tx: Tx): Promise<string> => {
      // Row lock on the account: concurrent issues for it run one at a time,
      // so the count below can't be raced past the cap.
      const locked = await tx.$queryRaw<{ document_id: string }[]>`
        SELECT document_id FROM accounts WHERE id = ${accountId} FOR UPDATE`;
      const recent = await tx.otpCode.count({
        where: {
          accountId,
          createdAt: { gt: new Date(now - OTP.ISSUE_WINDOW_MS) },
        },
      });
      if (recent >= OTP.MAX_ISSUED_PER_WINDOW) throw otpIssueLimitExceeded();

      const issuedAt = new Date(now);
      await tx.otpCode.updateMany({
        where: {
          accountId,
          purpose,
          usedAt: null,
          expiresAt: { gt: issuedAt },
        },
        data: { expiresAt: issuedAt },
      });
      await tx.otpCode.create({
        data: {
          accountId,
          purpose,
          codeHmac: otpHmac(pepper, accountId, purpose, code),
          createdAt: issuedAt,
          expiresAt: new Date(now + OTP.TTL_SECONDS * MS_PER_SECOND),
        },
      });
      await this.audit.record(tx, {
        actor: options.actor ?? selfActor(accountId),
        action: AUDIT_ACTIONS.AUTH_OTP_ISSUED,
        targetId: locked[0]?.document_id ?? null,
        metadata: { purpose },
        ip: options.ip,
      });
      return code;
    };
    return options.tx === undefined
      ? this.prisma.$transaction(run)
      : run(options.tx);
  }

  /**
   * Checks `code` against the live code of (account, purpose) without using
   * it up. Every check counts one attempt, committed at once; once 5 are
   * spent every further check fails, even with the right code. Returns the
   * row id to pass to `consume`, or undefined.
   */
  async verify(
    accountId: number,
    purpose: OtpPurpose,
    code: string,
  ): Promise<number | undefined> {
    const candidate = otpHmac(this.pepper(), accountId, purpose, code);
    const live = await this.prisma.otpCode.findFirst({
      where: {
        accountId,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date(this.clock.now()) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHmac: true },
    });
    if (live === null) return undefined;

    const counted = await this.prisma.otpCode.updateMany({
      where: { id: live.id, usedAt: null, attempts: { lt: OTP.MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) return undefined;

    const expected = Buffer.from(live.codeHmac, 'hex');
    const actual = Buffer.from(candidate, 'hex');
    return expected.length === actual.length &&
      timingSafeEqual(expected, actual)
      ? live.id
      : undefined;
  }

  /**
   * Marks a verified code used, inside the caller's transaction. Atomic:
   * of two concurrent requests holding the same code only one gets true.
   */
  async consume(tx: Tx, otpId: number): Promise<boolean> {
    const now = new Date(this.clock.now());
    const claimed = await tx.otpCode.updateMany({
      where: { id: otpId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return claimed.count === 1;
  }

  /** Same HMAC work as a real check, for requests about unknown emails. */
  hashForUnknownAccount(purpose: OtpPurpose, code: string): void {
    otpHmac(this.pepper(), DUMMY_ACCOUNT_ID, purpose, code);
  }

  private pepper(): string {
    const pepper = this.config.secrets.otpPepper;
    if (pepper === undefined) throw new Error('OTP_PEPPER is not configured');
    return pepper;
  }
}
