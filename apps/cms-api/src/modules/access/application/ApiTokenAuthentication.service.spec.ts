import { DomainError } from '../../../common/errors/Domain.errors';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/DomainErrorKinds.constants';
import { describeError } from '../../../common/http/describe-http-exception';

import { Clock } from '../../../common/time/clock';
import type { AppLogger } from '../../../infrastructure/logging/AppLogger.port';
import type { RolePolicy } from '../domain/ActorContext.entity';
import { API_TOKEN, hashApiToken } from '../domain/ApiToken.rules';
import type {
  AccountVersions,
  ApiTokenLookup,
  ApiTokenRecord,
} from './Access.port';
import { ApiTokenAuthentication } from './ApiTokenAuthentication.service';
import type { VersionCache } from './VersionCache.service';

const NOW = Date.UTC(2026, 0, 1);
const RAW = `${API_TOKEN.PREFIX}${'a'.repeat(43)}`;

const ROLE: RolePolicy = {
  id: 5,
  slug: 'editor',
  rank: 30,
  isSystem: true,
  policyVersion: 1,
  permissions: [],
};

function setup(
  overrides: {
    token?: Partial<ApiTokenRecord> | null;
    creator?: Partial<AccountVersions> | null;
    role?: RolePolicy | null;
  } = {},
) {
  const token: ApiTokenRecord | null =
    overrides.token === null
      ? null
      : {
          id: 7,
          documentId: 'token-doc-id',
          scope: { permissions: [] },
          expiresAt: null,
          revokedAt: null,
          lastUsedAt: null,
          creatorDocumentId: 'creator-doc-id',
          ...overrides.token,
        };
  const creator: AccountVersions | null =
    overrides.creator === null
      ? null
      : {
          id: 3,
          documentId: 'creator-doc-id',
          tokenVersion: 1,
          status: 'active',
          isDeleted: false,
          roleId: ROLE.id,
          reviewerSessionId: null,
          ...overrides.creator,
        };
  const findByHash = jest.fn(() => Promise.resolve(token));
  const writeLastUsedAt = jest.fn(() => Promise.resolve());
  const lookup: ApiTokenLookup = { findByHash, writeLastUsedAt };
  const versions = {
    getAccountVersions: jest.fn(() => Promise.resolve(creator)),
    getRolePolicy: jest.fn(() =>
      Promise.resolve(overrides.role === undefined ? ROLE : overrides.role),
    ),
  } as unknown as VersionCache;
  const clock = new Clock();
  jest.spyOn(clock, 'now').mockReturnValue(NOW);
  const warn = jest.fn();
  const error = jest.fn();
  const logger: AppLogger = { warn, error };
  return {
    service: new ApiTokenAuthentication(lookup, versions, clock, logger),
    findByHash,
    writeLastUsedAt,
    warn,
    error,
  };
}

const BARE_401_BODY = {
  statusCode: 401,
  errorCode: 'UNAUTHORIZED',
  message: 'Unauthorized',
};

async function expectBare401(promise: Promise<unknown>): Promise<DomainError> {
  const error: unknown = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect(describeError(error)).toMatchObject(BARE_401_BODY);
  return error as DomainError;
}

describe('ApiTokenAuthentication', () => {
  it('returns the token principal with the creator current role', async () => {
    const t = setup();
    const principal = await t.service.authenticate(RAW);
    expect(t.findByHash).toHaveBeenCalledWith(hashApiToken(RAW));
    expect(principal.tokenId).toBe('token-doc-id');
    expect(principal.actor).toMatchObject({
      kind: 'api_token',
      tokenId: 7,
      accountId: 3,
      role: ROLE,
    });
  });

  it('rejects a value without the token prefix before any lookup', async () => {
    const t = setup();
    await expectBare401(t.service.authenticate('not-a-token'));
    expect(t.findByHash).not.toHaveBeenCalled();
  });

  it('rejects an oversized value before hashing', async () => {
    const t = setup();
    await expectBare401(t.service.authenticate(`${RAW}${'a'.repeat(100)}`));
    expect(t.findByHash).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown hash', { token: null }],
    ['revoked', { token: { revokedAt: new Date(NOW - 1) } }],
    ['expired', { token: { expiresAt: new Date(NOW - 1) } }],
    ['expiring exactly now', { token: { expiresAt: new Date(NOW) } }],
    ['malformed scope', { token: { scope: { permissions: 'x' } } }],
    ['creator missing', { creator: null }],
    ['creator disabled', { creator: { status: 'disabled' as const } }],
    ['creator deleted', { creator: { isDeleted: true } }],
    ['role missing', { role: null }],
  ])('answers one bare 401 when the %s', async (_cause, overrides) => {
    const t = setup(overrides);
    const error = await expectBare401(t.service.authenticate(RAW));
    expect(error.kind).toBe(DOMAIN_ERROR_KINDS.UNAUTHENTICATED);
  });

  it('logs the token document id, never the raw value, for a malformed scope', async () => {
    const t = setup({ token: { scope: { permissions: 'x' } } });
    await expectBare401(t.service.authenticate(RAW));
    expect(t.error).toHaveBeenCalledTimes(1);
    const [message] = t.error.mock.calls[0] as [string];
    expect(message).toContain('token-doc-id');
    expect(message).not.toContain(RAW);
  });

  it('writes last_used_at only when the last write is old enough', async () => {
    const fresh = setup({ token: { lastUsedAt: new Date(NOW - 1_000) } });
    await fresh.service.authenticate(RAW);
    expect(fresh.writeLastUsedAt).not.toHaveBeenCalled();

    const stale = setup({
      token: {
        lastUsedAt: new Date(NOW - API_TOKEN.LAST_USED_WRITE_INTERVAL_MS),
      },
    });
    await stale.service.authenticate(RAW);
    expect(stale.writeLastUsedAt).toHaveBeenCalledWith(7, new Date(NOW));
  });

  it('never fails the request when last_used_at cannot be written', async () => {
    const t = setup();
    t.writeLastUsedAt.mockRejectedValueOnce(new Error('db down'));
    await expect(t.service.authenticate(RAW)).resolves.toBeDefined();
    expect(t.warn).toHaveBeenCalledTimes(1);
  });
});
