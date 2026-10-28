import { SessionRevocationService } from './SessionRevocation.service';

describe('SessionRevocationService', () => {
  it('revokes in the caller unit at the time the Clock gives', async () => {
    const unit = { afterCommit: jest.fn() };
    const revokeAll = jest.fn().mockResolvedValue(undefined);
    const frozenMs = Date.UTC(2026, 0, 2, 3, 4, 5);
    const service = new SessionRevocationService(
      { revokeAll },
      { now: () => frozenMs },
    );

    await service.revokeAll(unit, 7);

    expect(revokeAll).toHaveBeenCalledWith(unit, 7, new Date(frozenMs));
  });

  it('registers no after-commit callback: the caller owns the cache drop', async () => {
    const afterCommit = jest.fn();
    const service = new SessionRevocationService(
      { revokeAll: jest.fn() },
      { now: () => 0 },
    );

    await service.revokeAll({ afterCommit }, 1);

    expect(afterCommit).not.toHaveBeenCalled();
  });
});
