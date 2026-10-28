import { Clock } from '../../../common/time/Clock.service';
import type {
  TransactionRunner,
  UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import type { VersionCache } from '../../access';
import type { SecurityAuditService } from '../../security-audit';
import {
  REFRESH_TOKEN_REUSE_GRACE_MS,
  REFRESH_TOKEN_TTL_MS,
} from '../domain/Identity.constants';
import type {
  RefreshTokenAccountFacts,
  RefreshTokenRepository,
  RotatedTokenRecord,
} from './Identity.port';
import { hashRefreshToken, RefreshTokenService } from './RefreshToken.service';

const ROTATED_AT = 1_700_000_000_000;
const ACCOUNT_ID = 7;
const FAMILY_ID = 'family-1';
const META = { ip: '203.0.113.9', userAgent: 'jest' };

const ACCOUNT: RefreshTokenAccountFacts = {
  documentId: 'doc-1',
  status: 'active',
  deletedAt: null,
  tokenVersion: 3,
  policyVersion: 2,
};

class FakeClock extends Clock {
  time = ROTATED_AT;
  override now(): number {
    return this.time;
  }
}

/** Runs the work once and the after-commit callbacks when it resolves. */
class FakeRunner implements TransactionRunner {
  async run<T>(work: (unit: UnitOfWork) => Promise<T>): Promise<T> {
    const callbacks: Array<() => void> = [];
    const result = await work({
      afterCommit: (callback) => callbacks.push(callback),
    });
    callbacks.forEach((callback) => callback());
    return result;
  }
}

function setup() {
  const clock = new FakeClock();
  const rotatedToken: RotatedTokenRecord = {
    accountId: ACCOUNT_ID,
    familyId: FAMILY_ID,
    revokedAt: new Date(ROTATED_AT),
    successor: {
      familyId: FAMILY_ID,
      replacedById: null,
      revokedAt: null,
      expiresAt: new Date(ROTATED_AT + REFRESH_TOKEN_TTL_MS),
    },
    account: ACCOUNT,
  };
  const tokens = {
    findByHash: jest.fn().mockResolvedValue({
      id: 1,
      accountId: ACCOUNT_ID,
      familyId: FAMILY_ID,
      replacedById: 2,
      revokedAt: new Date(ROTATED_AT),
      expiresAt: new Date(ROTATED_AT + REFRESH_TOKEN_TTL_MS),
      account: ACCOUNT,
    }),
    findRotated: jest.fn().mockResolvedValue(rotatedToken),
    revokeFamilyAndBumpTokenVersion: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue(11),
  };
  const versions = { invalidateAccount: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new RefreshTokenService(
    tokens as unknown as RefreshTokenRepository,
    new FakeRunner(),
    versions as unknown as VersionCache,
    audit as unknown as SecurityAuditService,
    clock,
  );
  return { clock, tokens, versions, audit, service };
}

describe('hashRefreshToken (D9)', () => {
  it('is the hex SHA-256 of the raw token', () => {
    expect(hashRefreshToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('RefreshTokenService.rotate with a frozen clock', () => {
  it('answers grace for a late request inside the window', async () => {
    const { clock, service, tokens } = setup();
    clock.time = ROTATED_AT + REFRESH_TOKEN_REUSE_GRACE_MS;

    const result = await service.rotate('raw', META);

    expect(result.kind).toBe('grace');
    expect(tokens.revokeFamilyAndBumpTokenVersion).not.toHaveBeenCalled();
  });

  it('revokes the family and drops the version cache after the window', async () => {
    const { clock, service, tokens, versions, audit } = setup();
    clock.time = ROTATED_AT + REFRESH_TOKEN_REUSE_GRACE_MS + 1;

    const result = await service.rotate('raw', META);

    expect(result).toEqual({
      kind: 'reuse',
      accountId: ACCOUNT_ID,
      familyId: FAMILY_ID,
    });
    expect(tokens.revokeFamilyAndBumpTokenVersion).toHaveBeenCalledWith(
      expect.anything(),
      FAMILY_ID,
      ACCOUNT_ID,
      new Date(clock.time),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(versions.invalidateAccount).toHaveBeenCalledWith(ACCOUNT_ID);
  });
});

describe('RefreshTokenService.issue', () => {
  it('expires the token one TTL after the clock time', async () => {
    const { clock, service, tokens } = setup();

    await service.issue(ACCOUNT_ID, META);

    expect(tokens.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        expiresAt: new Date(clock.time + REFRESH_TOKEN_TTL_MS),
      }),
      undefined,
    );
  });
});
