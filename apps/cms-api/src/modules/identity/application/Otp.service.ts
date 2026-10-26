import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../common/time/clock';
import {
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
} from '../../../common/constants/time.constants';
import { type IAppConfig } from '../../../config/app-config';
import { APP_CONFIG } from '../../../config/config.constants';
import { type MailMessage } from '../../../infrastructure/mail/mail.port';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import {
  AUDIT_ACTIONS,
  type AuditActor,
  SecurityAuditService,
  selfActor,
} from '../../security-audit';
import {
  ADMIN_PAGE_PATHS,
  OTP,
  type OtpPurpose,
} from '../domain/Identity.constants';
import { tooManyRequests } from '../domain/Identity.errors';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
  OTP_CODE_REPOSITORY,
  type OtpCodeRepository,
} from './Identity.port';

const PRODUCT_NAME = 'Abyss CMS';

interface OtpMailCopy {
  readonly subject: string;
  readonly intro: string;
  /** Admin page where the code is entered; undefined = the current screen. */
  readonly pagePath: string | undefined;
}

/** English copy per purpose (plain text, the code only, no links). */
const OTP_MAIL_COPY: Readonly<Record<OtpPurpose, OtpMailCopy>> = {
  INVITE_SET_PASSWORD: {
    subject: `Your ${PRODUCT_NAME} invitation code`,
    intro: `You have been invited to ${PRODUCT_NAME}. Use this code to set your password:`,
    pagePath: ADMIN_PAGE_PATHS.SET_PASSWORD,
  },
  RESET_PASSWORD: {
    subject: `Your ${PRODUCT_NAME} password reset code`,
    intro: 'Use this code to reset your password:',
    pagePath: ADMIN_PAGE_PATHS.RESET_PASSWORD,
  },
  /** Sign-in and turning email 2FA on/off share this purpose. */
  LOGIN_2FA_EMAIL: {
    subject: `Your ${PRODUCT_NAME} verification code`,
    intro: 'Use this code to confirm it is you:',
    pagePath: undefined,
  },
};

/**
 * Builds the plain-text OTP email. The admin URL is written out as text
 * (not a link) so the reader can check where they type the code.
 */
export function buildOtpMail(
  to: string,
  purpose: OtpPurpose,
  code: string,
  adminOrigin: string | undefined,
): MailMessage {
  const copy = OTP_MAIL_COPY[purpose];
  const minutes = OTP.TTL_SECONDS / SECONDS_PER_MINUTE;
  const lines = [
    copy.intro,
    '',
    code,
    '',
    `The code expires in ${minutes} minutes and works once.`,
  ];
  if (copy.pagePath !== undefined && adminOrigin !== undefined) {
    lines.push(`Enter it at ${adminOrigin}${copy.pagePath}`);
  }
  lines.push(
    '',
    'If you did not ask for this code, you can ignore this email. Never share the code with anyone.',
  );
  return { to, subject: copy.subject, text: lines.join('\n') };
}

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
  readonly unit?: UnitOfWork | undefined;
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

/**
 * One-time codes in `otp_codes` (D8, SPEC §6, §12-9): 6 digits, 300 s TTL,
 * 5 checks per code, 5 codes per account per hour across all purposes, and
 * single use. Only the HMAC is stored; the raw code leaves through the
 * return value of `issue` and nowhere else.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(OTP_CODE_REPOSITORY) private readonly codes: OtpCodeRepository,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(CORE_TRANSACTION_RUNNER)
    private readonly runner: TransactionRunner,
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

    const run = async (unit: UnitOfWork): Promise<string> => {
      // Row lock on the account: concurrent issues for it run one at a time,
      // so the count below can't be raced past the cap.
      const documentId = await this.accounts.lockDocumentId(unit, accountId);
      const recent = await this.codes.countIssuedSince(
        unit,
        accountId,
        new Date(now - OTP.ISSUE_WINDOW_MS),
      );
      if (recent >= OTP.MAX_ISSUED_PER_WINDOW) throw tooManyRequests();

      const issuedAt = new Date(now);
      await this.codes.expireLive(unit, accountId, purpose, issuedAt);
      await this.codes.insert(unit, {
        accountId,
        purpose,
        codeHmac: otpHmac(pepper, accountId, purpose, code),
        createdAt: issuedAt,
        expiresAt: new Date(now + OTP.TTL_SECONDS * MS_PER_SECOND),
      });
      await this.audit.record(unit, {
        actor: options.actor ?? selfActor(accountId),
        action: AUDIT_ACTIONS.AUTH_OTP_ISSUED,
        targetId: documentId,
        metadata: { purpose },
        ip: options.ip,
      });
      return code;
    };
    return options.unit === undefined
      ? this.runner.run(run)
      : run(options.unit);
  }

  /**
   * Checks `code` against the live code of (account, purpose) without using
   * it up. Every check counts one attempt, committed at once; once 5 are
   * spent every further check fails, even with the right code. Returns the
   * row id to pass to `tryConsume`, or undefined.
   */
  async verify(
    accountId: number,
    purpose: OtpPurpose,
    code: string,
  ): Promise<number | undefined> {
    const candidate = otpHmac(this.pepper(), accountId, purpose, code);
    const live = await this.codes.findLive(
      accountId,
      purpose,
      new Date(this.clock.now()),
    );
    if (live === null) return undefined;

    const isCounted = await this.codes.countAttempt(live.id, OTP.MAX_ATTEMPTS);
    if (!isCounted) return undefined;

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
  tryConsume(unit: UnitOfWork, otpId: number): Promise<boolean> {
    return this.codes.markUsed(unit, otpId, new Date(this.clock.now()));
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
