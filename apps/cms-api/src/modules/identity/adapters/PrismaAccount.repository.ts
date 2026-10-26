import { Injectable } from '@nestjs/common';

import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type {
  AccountRepository,
  TotpAccount,
  TotpStepClaim,
} from '../application/Identity.port';

/** Prisma `select` for `TotpAccount`. */
export const TOTP_ACCOUNT_SELECT = {
  id: true,
  documentId: true,
  totpSecretEnc: true,
  totpSecretKid: true,
  totpLastStep: true,
} as const;

/**
 * Account columns every 2FA operation reads. Transitional (removedBy CR-id-3):
 * the 2FA services still read accounts with Prisma until they use this port.
 */
export const TWO_FACTOR_ACCOUNT_SELECT = {
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

@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTotpAccount(accountId: number): Promise<TotpAccount | null> {
    return this.prisma.account.findUnique({
      where: { id: accountId },
      select: TOTP_ACCOUNT_SELECT,
    });
  }

  async claimTotpStep(claim: TotpStepClaim): Promise<boolean> {
    const { resealed } = claim;
    const claimed = await this.prisma.account.updateMany({
      where: {
        id: claim.accountId,
        is2faEnabled: true,
        twoFaMethod: 'totp',
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: claim.step } }],
      },
      data: {
        totpLastStep: claim.step,
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

  async lockDocumentId(
    unit: UnitOfWork,
    accountId: number,
  ): Promise<string | null> {
    const locked = await prismaTxOf(unit).$queryRaw<{ document_id: string }[]>`
        SELECT document_id FROM accounts WHERE id = ${accountId} FOR UPDATE`;
    return locked[0]?.document_id ?? null;
  }
}
