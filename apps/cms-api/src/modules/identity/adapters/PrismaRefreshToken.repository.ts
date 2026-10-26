import { Injectable } from '@nestjs/common';

import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type {
  NewRefreshToken,
  RefreshTokenFamilyOwner,
  RefreshTokenRecord,
  RefreshTokenRepository,
  RotatedTokenRecord,
} from '../application/Identity.port';

const ACCOUNT_FACTS_SELECT = {
  documentId: true,
  status: true,
  deletedAt: true,
  tokenVersion: true,
  role: { select: { policyVersion: true } },
} as const;

interface AccountFactsRow {
  readonly documentId: string;
  readonly status: string;
  readonly deletedAt: Date | null;
  readonly tokenVersion: number;
  readonly role: { readonly policyVersion: number };
}

function accountFactsOf(row: AccountFactsRow) {
  return {
    documentId: row.documentId,
    status: row.status,
    deletedAt: row.deletedAt,
    tokenVersion: row.tokenVersion,
    policyVersion: row.role.policyVersion,
  };
}

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(token: NewRefreshToken, unit?: UnitOfWork): Promise<number> {
    const client = unit === undefined ? this.prisma : prismaTxOf(unit);
    const row = await client.refreshToken.create({
      data: token,
      select: { id: true },
    });
    return row.id;
  }

  async findByHash(
    unit: UnitOfWork,
    tokenHash: string,
  ): Promise<RefreshTokenRecord | null> {
    const row = await prismaTxOf(unit).refreshToken.findUnique({
      where: { tokenHash },
      include: { account: { select: ACCOUNT_FACTS_SELECT } },
    });
    if (row === null) return null;
    return {
      id: row.id,
      accountId: row.accountId,
      familyId: row.familyId,
      replacedById: row.replacedById,
      revokedAt: row.revokedAt,
      expiresAt: row.expiresAt,
      account: accountFactsOf(row.account),
    };
  }

  async findFamilyOwnerByHash(
    tokenHash: string,
  ): Promise<RefreshTokenFamilyOwner | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        familyId: true,
        accountId: true,
        account: { select: { documentId: true } },
      },
    });
    if (row === null) return null;
    return {
      familyId: row.familyId,
      accountId: row.accountId,
      accountDocumentId: row.account.documentId,
    };
  }

  async findRotated(
    unit: UnitOfWork,
    tokenId: number,
  ): Promise<RotatedTokenRecord> {
    const row = await prismaTxOf(unit).refreshToken.findUniqueOrThrow({
      where: { id: tokenId },
      select: {
        accountId: true,
        familyId: true,
        revokedAt: true,
        replacedBy: {
          select: {
            familyId: true,
            replacedById: true,
            revokedAt: true,
            expiresAt: true,
          },
        },
        account: { select: ACCOUNT_FACTS_SELECT },
      },
    });
    return {
      accountId: row.accountId,
      familyId: row.familyId,
      revokedAt: row.revokedAt,
      successor: row.replacedBy,
      account: accountFactsOf(row.account),
    };
  }

  async claimRotation(
    unit: UnitOfWork,
    tokenId: number,
    successorId: number,
    at: Date,
  ): Promise<boolean> {
    // Row lock: a concurrent rotation of the same token waits here, then
    // sees replaced_by_id set and claims nothing.
    const claimed = await prismaTxOf(unit).refreshToken.updateMany({
      where: { id: tokenId, replacedById: null, revokedAt: null },
      data: { replacedById: successorId, revokedAt: at },
    });
    return claimed.count > 0;
  }

  async deleteById(unit: UnitOfWork, tokenId: number): Promise<void> {
    await prismaTxOf(unit).refreshToken.delete({ where: { id: tokenId } });
  }

  async revokeFamily(
    unit: UnitOfWork,
    familyId: string,
    at: Date,
  ): Promise<void> {
    await prismaTxOf(unit).refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async revokeFamilyAndBumpTokenVersion(
    unit: UnitOfWork,
    familyId: string,
    accountId: number,
    at: Date,
  ): Promise<void> {
    await this.revokeFamily(unit, familyId, at);
    await prismaTxOf(unit).account.update({
      where: { id: accountId },
      data: { tokenVersion: { increment: 1 } },
    });
  }
}
