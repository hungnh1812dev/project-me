import { Inject, Injectable, Logger } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';

import { Clock } from '../../common/clock';
import { MS_PER_SECOND } from '../../common/constants/limits.constants';
import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SecretBox, SecretBoxError } from './crypto/secret-box';
import { TOTP } from './identity.constants';
import { type ResetSecondFactor } from './reset-second-factor';

const LOGGER_CONTEXT = 'TotpService';
const TOTP_CODE_PATTERN = new RegExp(`^\\d{${TOTP.DIGITS}}$`);

/** True when `code` has the shape of a TOTP code (exactly 6 digits). */
export function isTotpCodeFormat(code: string): boolean {
  return TOTP_CODE_PATTERN.test(code);
}

/** The TOTP fields of an account row needed to check a code. */
export interface TotpAccount {
  readonly id: number;
  readonly documentId: string;
  readonly totpSecretEnc: string | null;
  readonly totpSecretKid: string | null;
  readonly totpLastStep: number | null;
}

/**
 * TOTP (D8, T13): secrets, otpauth URIs and code checks with replay
 * protection. A code is accepted only when its time step is above
 * `accounts.totp_last_step`, and the step is stored with a conditional
 * update, so of two requests with the same code only one wins. Also the
 * RESET_SECOND_FACTOR of password reset.
 */
@Injectable()
export class TotpService implements ResetSecondFactor {
  private readonly logger = new Logger(LOGGER_CONTEXT);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretBox: SecretBox,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
  ) {}

  /** A fresh base32 secret (160 bits). */
  createSecret(): string {
    return generateSecret({ length: TOTP.SECRET_BYTES });
  }

  /** `otpauth://` URI for the QR code; the label is the account email. */
  otpauthUri(email: string, secret: string): string {
    return generateURI({
      issuer: this.config.auth.totp.issuer,
      label: email,
      secret,
      algorithm: TOTP.ALGORITHM,
      digits: TOTP.DIGITS,
      period: TOTP.PERIOD_SECONDS,
    });
  }

  /**
   * Time step `code` matches (now ±1 step), or undefined. Steps at or below
   * `afterStep` never match (replay).
   */
  async matchStep(
    secret: string,
    code: string,
    afterStep: number | null,
  ): Promise<number | undefined> {
    if (!isTotpCodeFormat(code)) return undefined;
    const result = await verify({
      secret,
      token: code,
      algorithm: TOTP.ALGORITHM,
      digits: TOTP.DIGITS,
      period: TOTP.PERIOD_SECONDS,
      epoch: Math.floor(this.clock.now() / MS_PER_SECOND),
      epochTolerance: TOTP.PERIOD_SECONDS * TOTP.TOLERANCE_STEPS,
      ...(afterStep === null ? {} : { afterTimeStep: afterStep }),
    });
    // otplib's result type also covers HOTP, which has no timeStep.
    return result.valid && 'timeStep' in result ? result.timeStep : undefined;
  }

  /** Decrypts the stored secret; undefined (logged) when it can't be opened. */
  openSecret(account: TotpAccount): string | undefined {
    if (account.totpSecretEnc === null || account.totpSecretKid === null) {
      return undefined;
    }
    try {
      return this.secretBox.open(
        { ciphertext: account.totpSecretEnc, kid: account.totpSecretKid },
        account.documentId,
      );
    } catch (error) {
      if (!(error instanceof SecretBoxError)) throw error;
      // Fail closed. The message names the kid at most, never key or secret.
      this.logger.error(`TOTP secret unreadable: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Checks a code of an account with TOTP on, and on success stores its step
   * (and re-encrypts the secret when an older key sealed it). False for a
   * wrong, replayed or concurrent-duplicate code.
   */
  async verifyAccountCode(
    account: TotpAccount,
    code: string,
  ): Promise<boolean> {
    const secret = this.openSecret(account);
    if (secret === undefined) return false;
    const step = await this.matchStep(secret, code, account.totpLastStep);
    if (step === undefined) return false;

    const resealed =
      account.totpSecretKid !== null &&
      !this.secretBox.isCurrent(account.totpSecretKid)
        ? this.secretBox.seal(secret, account.documentId)
        : undefined;
    const claimed = await this.prisma.account.updateMany({
      where: {
        id: account.id,
        is2faEnabled: true,
        twoFaMethod: 'totp',
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      },
      data: {
        totpLastStep: step,
        ...(resealed === undefined
          ? {}
          : {
              totpSecretEnc: resealed.ciphertext,
              totpSecretKid: resealed.kid,
            }),
      },
    });
    return claimed.count === 1;
  }

  /** RESET_SECOND_FACTOR (D8): an account with TOTP on needs a valid code. */
  async verify(
    accountId: number,
    totpCode: string | undefined,
  ): Promise<boolean> {
    if (totpCode === undefined) return false;
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: TOTP_ACCOUNT_SELECT,
    });
    if (account === null) return false;
    return this.verifyAccountCode(account, totpCode);
  }
}

/** Prisma `select` for `TotpAccount`. */
export const TOTP_ACCOUNT_SELECT = {
  id: true,
  documentId: true,
  totpSecretEnc: true,
  totpSecretKid: true,
  totpLastStep: true,
} as const;
