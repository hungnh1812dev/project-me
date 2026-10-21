import { Clock } from '../../common/clock';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import { VERSION_CACHE_TTL_MS } from './access.constants';
import { VersionCache } from './version-cache';

const DOC_ID = '0190a3c2-7b1e-7c3d-9f00-000000000001';

function setup() {
  let now = 0;
  const clock = new Clock();
  jest.spyOn(clock, 'now').mockImplementation(() => now);
  const account = {
    id: 1,
    documentId: DOC_ID,
    tokenVersion: 1,
    status: 'active',
    deletedAt: null,
    roleId: 5,
  };
  const role = {
    id: 5,
    slug: 'editor',
    rank: 30,
    isSystem: true,
    policyVersion: 1,
    permissions: [],
  };
  const findAccount = jest.fn(() => Promise.resolve({ ...account }));
  const findRole = jest.fn(() => Promise.resolve({ ...role }));
  const prisma = {
    account: { findUnique: findAccount },
    role: { findUnique: findRole },
  } as unknown as PrismaService;
  return {
    cache: new VersionCache(prisma, clock),
    account,
    role,
    findAccount,
    findRole,
    advance: (ms: number) => (now += ms),
  };
}

describe('VersionCache', () => {
  it('serves from memory within the TTL and re-reads after it', async () => {
    const t = setup();
    await t.cache.account(DOC_ID);
    await t.cache.account(DOC_ID);
    expect(t.findAccount).toHaveBeenCalledTimes(1);
    t.advance(VERSION_CACHE_TTL_MS);
    await t.cache.account(DOC_ID);
    expect(t.findAccount).toHaveBeenCalledTimes(2);
  });

  it('invalidation forces a re-read', async () => {
    const t = setup();
    await t.cache.account(DOC_ID);
    await t.cache.rolePolicy(5);
    t.cache.invalidateAccount(1);
    t.cache.invalidateRole(5);
    t.account.status = 'disabled';
    t.role.policyVersion = 2;
    expect((await t.cache.account(DOC_ID))?.status).toBe('disabled');
    expect((await t.cache.rolePolicy(5))?.policyVersion).toBe(2);
  });

  it('a token newer than the cache forces a re-read', async () => {
    const t = setup();
    await t.cache.account(DOC_ID, 1);
    await t.cache.rolePolicy(5, 1);
    t.account.tokenVersion = 2;
    t.role.policyVersion = 3;
    expect((await t.cache.account(DOC_ID, 2))?.tokenVersion).toBe(2);
    expect((await t.cache.rolePolicy(5, 3))?.policyVersion).toBe(3);
    // An older claim is served from the cache (the guard then rejects tv).
    await t.cache.account(DOC_ID, 1);
    expect(t.findAccount).toHaveBeenCalledTimes(2);
  });

  it('does not cache a read that raced an invalidation', async () => {
    const t = setup();
    let release: () => void = () => undefined;
    t.findRole.mockImplementationOnce(() => {
      // The row as read before the write committed.
      const snapshot = { ...t.role };
      return new Promise((resolve) => {
        release = () => resolve(snapshot);
      });
    });
    const stale = t.cache.rolePolicy(5);
    t.role.policyVersion = 2;
    t.cache.invalidateRole(5);
    release();
    expect((await stale)?.policyVersion).toBe(1);
    expect((await t.cache.rolePolicy(5))?.policyVersion).toBe(2);
  });
});
