import { Injectable } from '@nestjs/common';

import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type { SessionRevocationRepository } from '../application/Identity.port';

/**
 * Holds no connection: it writes through the caller's unit, so the
 * `owner:reset-2fa` CLI can build it without Nest.
 */
@Injectable()
export class PrismaSessionRevocationRepository implements SessionRevocationRepository {
  async revokeAll(
    unit: UnitOfWork,
    accountId: number,
    at: Date,
  ): Promise<void> {
    const tx = prismaTxOf(unit);
    await tx.account.update({
      where: { id: accountId },
      data: { tokenVersion: { increment: 1 } },
    });
    await tx.refreshToken.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: at },
    });
  }
}
