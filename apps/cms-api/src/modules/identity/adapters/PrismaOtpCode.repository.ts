import { Injectable } from '@nestjs/common';

import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type {
  LiveOtpCode,
  NewOtpCode,
  OtpCodeRepository,
} from '../application/Identity.port';
import type { OtpPurpose } from '../domain/Identity.constants';

@Injectable()
export class PrismaOtpCodeRepository implements OtpCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  countIssuedSince(
    unit: UnitOfWork,
    accountId: number,
    since: Date,
  ): Promise<number> {
    return prismaTxOf(unit).otpCode.count({
      where: { accountId, createdAt: { gt: since } },
    });
  }

  async expireLive(
    unit: UnitOfWork,
    accountId: number,
    purpose: OtpPurpose,
    at: Date,
  ): Promise<void> {
    await prismaTxOf(unit).otpCode.updateMany({
      where: { accountId, purpose, usedAt: null, expiresAt: { gt: at } },
      data: { expiresAt: at },
    });
  }

  async insert(unit: UnitOfWork, code: NewOtpCode): Promise<void> {
    await prismaTxOf(unit).otpCode.create({ data: code });
  }

  findLive(
    accountId: number,
    purpose: OtpPurpose,
    now: Date,
  ): Promise<LiveOtpCode | null> {
    return this.prisma.otpCode.findFirst({
      where: { accountId, purpose, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHmac: true },
    });
  }

  async countAttempt(codeId: number, maxAttempts: number): Promise<boolean> {
    const counted = await this.prisma.otpCode.updateMany({
      where: { id: codeId, usedAt: null, attempts: { lt: maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    return counted.count > 0;
  }

  async markUsed(unit: UnitOfWork, codeId: number, at: Date): Promise<boolean> {
    const claimed = await prismaTxOf(unit).otpCode.updateMany({
      where: { id: codeId, usedAt: null, expiresAt: { gt: at } },
      data: { usedAt: at },
    });
    return claimed.count === 1;
  }
}
