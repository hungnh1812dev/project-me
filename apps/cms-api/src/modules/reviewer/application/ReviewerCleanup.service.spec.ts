import type { VersionCache } from '../../access';
import type { ReviewerAccountGateway } from './Reviewer.port';
import { ReviewerCleanupService } from './ReviewerCleanup.service';

const NOW_MS = 5_000;

function cleanupOver(batches: number[][]) {
  const remaining = [...batches];
  const deleteAccounts = jest.fn().mockResolvedValue(undefined);
  const invalidateAccount = jest.fn();
  const service = new ReviewerCleanupService(
    {
      findExpiredAccountIds: () => Promise.resolve(remaining.shift() ?? []),
      deleteAccounts,
    } as unknown as ReviewerAccountGateway,
    { now: () => NOW_MS },
    { invalidateAccount } as unknown as VersionCache,
  );
  return { service, deleteAccounts, invalidateAccount };
}

describe('ReviewerCleanupService', () => {
  it('deletes each batch, drops each account from the cache and counts them', async () => {
    const { service, deleteAccounts, invalidateAccount } = cleanupOver([
      [1, 2],
    ]);

    await expect(service.run()).resolves.toBe(2);
    expect(deleteAccounts).toHaveBeenCalledWith([1, 2]);
    expect(invalidateAccount.mock.calls).toEqual([[1], [2]]);
  });

  it('deletes nothing when no account has expired', async () => {
    const { service, deleteAccounts } = cleanupOver([]);

    await expect(service.run()).resolves.toBe(0);
    expect(deleteAccounts).not.toHaveBeenCalled();
  });
});
