import { type Prisma } from '../../generated/prisma/client';

type Tx = Prisma.TransactionClient;

async function revokeAllRefreshTokens(
  tx: Tx,
  accountId: number,
): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { accountId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Ends every session of an account in the caller's transaction: the
 * `tokenVersion` bump kills live access tokens, the revoke kills every
 * refresh token. The caller invalidates `VersionCache` after commit. Plain
 * function, so the `owner:reset-2fa` CLI can use it without Nest.
 */
export async function revokeAllSessions(
  tx: Tx,
  accountId: number,
): Promise<void> {
  await tx.account.update({
    where: { id: accountId },
    data: { tokenVersion: { increment: 1 } },
  });
  await revokeAllRefreshTokens(tx, accountId);
}
