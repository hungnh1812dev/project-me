import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../../../generated/prisma/client';
import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaClient } from '../../../infrastructure/database/prisma-client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import { type AccountStatus, OWNER_ROLE_SLUG } from '../../access';
import type {
  AccountProfileRecord,
  AccountRepository,
  CodeAccountRecord,
  CreatedAccount,
  LoginAccountRecord,
  NewAccount,
  PasswordAccountRecord,
  ResettableAccount,
  RoleFacts,
  TotpAccount,
  TotpStepClaim,
  TwoFactorAccountRecord,
  TwoFactorChange,
} from '../application/Identity.port';
import type { SealedSecret } from '../application/SecretBox.service';
import { OWNER_BOOTSTRAP_LOCK_KEY } from '../domain/Identity.constants';

const TOTP_ACCOUNT_SELECT = {
  id: true,
  documentId: true,
  totpSecretEnc: true,
  totpSecretKid: true,
  totpLastStep: true,
} as const;

const LOGIN_ACCOUNT_SELECT = {
  id: true,
  documentId: true,
  passwordHash: true,
  status: true,
  deletedAt: true,
  tokenVersion: true,
  is2faEnabled: true,
  twoFaMethod: true,
  role: { select: { policyVersion: true } },
} as const;

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

/** Columns cleared when TOTP is not the method that stays on. */
const CLEARED_TOTP = {
  totpSecretEnc: null,
  totpSecretKid: null,
  totpLastStep: null,
} as const;

function flattenPolicyVersion<Row extends { role: { policyVersion: number } }>(
  row: Row | null,
): (Omit<Row, 'role'> & { policyVersion: number }) | null {
  if (row === null) return null;
  const { role, ...columns } = row;
  return { ...columns, policyVersion: role.policyVersion };
}

function nextTwoFactorData(
  next: TwoFactorChange['next'],
): Prisma.AccountUpdateManyMutationInput {
  if (!next.isEnabled) {
    return { is2faEnabled: false, twoFaMethod: null, ...CLEARED_TOTP };
  }
  if (next.method === 'email') {
    return { is2faEnabled: true, twoFaMethod: 'email', ...CLEARED_TOTP };
  }
  return {
    is2faEnabled: true,
    twoFaMethod: 'totp',
    totpLastStep: next.lastStep,
  };
}

@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  /** Typed as the client so the CLIs can build the adapter on a plain `PrismaClient`. */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  async findLoginAccount(email: string): Promise<LoginAccountRecord | null> {
    return flattenPolicyVersion(
      await this.prisma.account.findUnique({
        where: { email },
        select: LOGIN_ACCOUNT_SELECT,
      }),
    );
  }

  findProfile(documentId: string): Promise<AccountProfileRecord | null> {
    return this.prisma.account.findUnique({
      where: { documentId },
      select: {
        documentId: true,
        email: true,
        displayName: true,
        roleSlug: true,
        status: true,
        deletedAt: true,
        is2faEnabled: true,
        twoFaMethod: true,
      },
    });
  }

  findPasswordAccount(
    documentId: string,
  ): Promise<PasswordAccountRecord | null> {
    return this.prisma.account.findUnique({
      where: { documentId },
      select: {
        id: true,
        documentId: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
      },
    });
  }

  findCodeAccount(email: string): Promise<CodeAccountRecord | null> {
    return this.prisma.account.findUnique({
      where: { email },
      select: {
        id: true,
        documentId: true,
        email: true,
        status: true,
        deletedAt: true,
        is2faEnabled: true,
        twoFaMethod: true,
      },
    });
  }

  async findTwoFactorAccount(
    documentId: string,
  ): Promise<TwoFactorAccountRecord | null> {
    return flattenPolicyVersion(
      await this.prisma.account.findUnique({
        where: { documentId },
        select: TWO_FACTOR_ACCOUNT_SELECT,
      }),
    );
  }

  async storePassword(
    unit: UnitOfWork,
    accountId: number,
    passwordHash: string,
    status?: AccountStatus,
  ): Promise<void> {
    await prismaTxOf(unit).account.update({
      where: { id: accountId },
      data: { ...(status === undefined ? {} : { status }), passwordHash },
    });
  }

  async storePendingTotp(
    accountId: number,
    sealed: SealedSecret,
  ): Promise<boolean> {
    const stored = await this.prisma.account.updateMany({
      where: { id: accountId, is2faEnabled: false },
      data: {
        totpSecretEnc: sealed.ciphertext,
        totpSecretKid: sealed.kid,
        totpLastStep: null,
      },
    });
    return stored.count > 0;
  }

  async changeTwoFactor(
    unit: UnitOfWork,
    { accountId, expect, next }: TwoFactorChange,
  ): Promise<boolean> {
    const written = await prismaTxOf(unit).account.updateMany({
      where: {
        id: accountId,
        is2faEnabled: expect.isEnabled,
        ...(expect.method === undefined ? {} : { twoFaMethod: expect.method }),
        ...(expect.sealedSecret === undefined
          ? {}
          : { totpSecretEnc: expect.sealedSecret }),
      },
      data: nextTwoFactorData(next),
    });
    return written.count > 0;
  }

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

  async hasLiveOwner(unit?: UnitOfWork): Promise<boolean> {
    const client = unit === undefined ? this.prisma : prismaTxOf(unit);
    const owner = await client.account.findFirst({
      where: { roleSlug: OWNER_ROLE_SLUG, deletedAt: null },
      select: { id: true },
    });
    return owner !== null;
  }

  async lockOwnerCreation(unit: UnitOfWork): Promise<void> {
    await prismaTxOf(unit)
      .$executeRaw`SELECT pg_advisory_xact_lock(${OWNER_BOOTSTRAP_LOCK_KEY})`;
  }

  findRole(unit: UnitOfWork, slug: string): Promise<RoleFacts | null> {
    return prismaTxOf(unit).role.findUnique({
      where: { slug },
      select: { id: true, isSystem: true },
    });
  }

  async isEmailTaken(unit: UnitOfWork, email: string): Promise<boolean> {
    const taken = await prismaTxOf(unit).account.findUnique({
      where: { email },
      select: { id: true },
    });
    return taken !== null;
  }

  createAccount(
    unit: UnitOfWork,
    account: NewAccount,
  ): Promise<CreatedAccount> {
    return prismaTxOf(unit).account.create({
      data: {
        email: account.email,
        displayName: account.displayName,
        passwordHash: account.passwordHash,
        status: 'active',
        role: {
          connect: { id_slug: { id: account.roleId, slug: account.roleSlug } },
        },
        ...(account.isEmail2faEnabled === true
          ? { is2faEnabled: true, twoFaMethod: 'email' as const }
          : {}),
      },
      select: { id: true, documentId: true, email: true },
    });
  }

  findResettableAccount(
    unit: UnitOfWork,
    email: string,
  ): Promise<ResettableAccount | null> {
    return prismaTxOf(unit).account.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, documentId: true, email: true, twoFaMethod: true },
    });
  }

  async clearTwoFactor(unit: UnitOfWork, accountId: number): Promise<boolean> {
    const cleared = await prismaTxOf(unit).account.updateMany({
      where: { id: accountId, is2faEnabled: true },
      data: { is2faEnabled: false, twoFaMethod: null, ...CLEARED_TOTP },
    });
    return cleared.count > 0;
  }
}
