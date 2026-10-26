import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';

/**
 * Ends every session of an account in the caller's unit: the `tokenVersion`
 * bump kills live access tokens, the revoke kills every refresh token. The
 * caller invalidates `VersionCache` after commit. Plain function, so the
 * `owner:reset-2fa` CLI can use it without Nest. Callers that still hold a
 * Prisma `tx` wrap it with `unitOfWorkFromPrismaTx` (removedBy CR-cl-1).
 */
export async function revokeAllSessions(
  unit: UnitOfWork,
  accountId: number,
): Promise<void> {
  const tx = prismaTxOf(unit);
  await tx.account.update({
    where: { id: accountId },
    data: { tokenVersion: { increment: 1 } },
  });
  await tx.refreshToken.updateMany({
    where: { accountId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
