import { LOGIN_FAILURE_REASONS } from '../../security-audit';
import {
  isRefreshInGrace,
  loginFailureReason,
  type RotatedTokenFacts,
} from './Authentication.rules';
import { REFRESH_TOKEN_REUSE_GRACE_MS } from './Identity.constants';

describe('loginFailureReason', () => {
  const active = { passwordHash: 'hash', status: 'active', deletedAt: null };

  it('lets an active account with the right password go on', () => {
    expect(loginFailureReason(active, true)).toBeUndefined();
  });

  it.each([
    ['no account', null, true, LOGIN_FAILURE_REASONS.UNKNOWN_ACCOUNT],
    [
      'no password yet',
      { ...active, passwordHash: null },
      true,
      LOGIN_FAILURE_REASONS.NO_PASSWORD,
    ],
    ['wrong password', active, false, LOGIN_FAILURE_REASONS.BAD_PASSWORD],
    [
      'disabled account',
      { ...active, status: 'disabled' },
      true,
      LOGIN_FAILURE_REASONS.NOT_ACTIVE,
    ],
    [
      'deleted account',
      { ...active, deletedAt: new Date() },
      true,
      LOGIN_FAILURE_REASONS.NOT_ACTIVE,
    ],
  ])('names the reason for %s', (_name, account, isPasswordCorrect, reason) => {
    expect(loginFailureReason(account, isPasswordCorrect)).toBe(reason);
  });

  it('reports a wrong password before an inactive account', () => {
    expect(loginFailureReason({ ...active, status: 'disabled' }, false)).toBe(
      LOGIN_FAILURE_REASONS.BAD_PASSWORD,
    );
  });
});

describe('isRefreshInGrace', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const rotatedAt = new Date(now.getTime() - 1_000);
  const live: RotatedTokenFacts = {
    familyId: 'family',
    revokedAt: rotatedAt,
    successor: {
      familyId: 'family',
      replacedById: null,
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 60_000),
    },
    account: { status: 'active', deletedAt: null },
  };
  const withSuccessor = (
    change: Partial<NonNullable<RotatedTokenFacts['successor']>>,
  ): RotatedTokenFacts => ({
    ...live,
    successor: { ...live.successor!, ...change },
  });

  it('accepts a late request inside the window', () => {
    expect(isRefreshInGrace(live, now)).toBe(true);
  });

  it('accepts a request exactly at the end of the window', () => {
    const edge = new Date(rotatedAt.getTime() + REFRESH_TOKEN_REUSE_GRACE_MS);
    expect(isRefreshInGrace(live, edge)).toBe(true);
  });

  it.each([
    [
      'after the window',
      live,
      new Date(rotatedAt.getTime() + REFRESH_TOKEN_REUSE_GRACE_MS + 1),
    ],
    ['token never rotated', { ...live, revokedAt: null }, now],
    ['no successor', { ...live, successor: null }, now],
    ['successor in another family', withSuccessor({ familyId: 'other' }), now],
    ['successor already rotated', withSuccessor({ replacedById: 9 }), now],
    ['successor revoked', withSuccessor({ revokedAt: rotatedAt }), now],
    ['successor expired', withSuccessor({ expiresAt: now }), now],
    [
      'account not active',
      { ...live, account: { status: 'disabled', deletedAt: null } },
      now,
    ],
    [
      'account deleted',
      { ...live, account: { status: 'active', deletedAt: now } },
      now,
    ],
  ])('refuses %s (reuse)', (_name, token, at) => {
    expect(isRefreshInGrace(token, at)).toBe(false);
  });
});
