import type { VersionCache } from '../../access';
import {
  DomainError,
  DOMAIN_ERROR_KINDS,
} from '../../../common/errors/Domain.errors';
import { AccessSessionService } from './AccessSession.service';

const CLAIMS = { sub: 'doc-1', tv: 3, pv: 7 } as never;
const ROLE = {
  id: 2,
  slug: 'editor',
  policyVersion: 9,
  permissions: [],
} as never;

function build(overrides: {
  account?: Record<string, unknown> | null;
  role?: unknown;
  acceptsReviewerTokens?: boolean;
}) {
  const account =
    overrides.account === undefined
      ? {
          id: 1,
          tokenVersion: 3,
          status: 'active',
          isDeleted: false,
          roleId: 2,
          reviewerSessionId: null,
        }
      : overrides.account;
  const getRolePolicy = jest.fn((_roleId: number, _pv: number) =>
    Promise.resolve('role' in overrides ? overrides.role : ROLE),
  );
  const versions = {
    getAccountVersions: jest.fn(() => Promise.resolve(account)),
    getRolePolicy,
  } as unknown as VersionCache;
  return {
    service: new AccessSessionService(
      versions,
      overrides.acceptsReviewerTokens ?? true,
    ),
    getRolePolicy,
  };
}

async function kindOf(promise: Promise<unknown>): Promise<unknown> {
  const error: unknown = await promise.catch((e: unknown) => e);
  return error instanceof DomainError ? error.kind : error;
}

describe('AccessSessionService.authenticate', () => {
  it('returns the account with the role policy version, which may be newer than the token pv', async () => {
    const { service } = build({});
    const result = await service.authenticate(CLAIMS);
    expect(result).toMatchObject({
      accountId: 'doc-1',
      tokenVersion: 3,
      policyVersion: 9,
    });
  });

  it.each([
    ['an unknown account', { account: null }],
    ['a stale token version', { account: { tokenVersion: 4 } }],
    ['an inactive account', { account: { status: 'invited' } }],
    ['a deleted account', { account: { isDeleted: true } }],
  ])('refuses %s with 401', async (_name, overrides) => {
    const base = {
      id: 1,
      tokenVersion: 3,
      status: 'active',
      isDeleted: false,
      roleId: 2,
      reviewerSessionId: null,
    };
    const account =
      overrides.account === null ? null : { ...base, ...overrides.account };
    const { service } = build({ account });
    await expect(kindOf(service.authenticate(CLAIMS))).resolves.toBe(
      DOMAIN_ERROR_KINDS.UNAUTHENTICATED,
    );
  });

  it('refuses a role that no longer exists with 401', async () => {
    const { service } = build({ role: null });
    await expect(kindOf(service.authenticate(CLAIMS))).resolves.toBe(
      DOMAIN_ERROR_KINDS.UNAUTHENTICATED,
    );
  });

  it('refuses a reviewer-role account with no session row with 401', async () => {
    const { service } = build({
      role: { ...(ROLE as object), slug: 'reviewer' },
    });
    await expect(kindOf(service.authenticate(CLAIMS))).resolves.toBe(
      DOMAIN_ERROR_KINDS.UNAUTHENTICATED,
    );
  });

  describe('reviewer tokens and the deploy switch (ADR 0014)', () => {
    const REVIEWER_ROLE = { ...(ROLE as object), slug: 'reviewer' };
    const reviewerAccount = {
      id: 1,
      tokenVersion: 3,
      status: 'active',
      isDeleted: false,
      roleId: 2,
      reviewerSessionId: 5,
    };

    it('resolves a reviewer account to the reviewer actor while the switch is on', async () => {
      const { service } = build({
        account: reviewerAccount,
        role: REVIEWER_ROLE,
      });
      const { actor } = await service.authenticate(CLAIMS);
      expect(actor).toMatchObject({ kind: 'reviewer' });
    });

    it('refuses a reviewer account with 401 while the switch is off', async () => {
      const { service } = build({
        account: reviewerAccount,
        role: REVIEWER_ROLE,
        acceptsReviewerTokens: false,
      });
      await expect(kindOf(service.authenticate(CLAIMS))).resolves.toBe(
        DOMAIN_ERROR_KINDS.UNAUTHENTICATED,
      );
    });

    it('still resolves an account of another role while the switch is off', async () => {
      const { service } = build({ acceptsReviewerTokens: false });
      await expect(service.authenticate(CLAIMS)).resolves.toMatchObject({
        accountId: 'doc-1',
      });
    });
  });

  it('reads the role with the token pv so a newer pv forces a re-read', async () => {
    const { service, getRolePolicy } = build({});
    await service.authenticate(CLAIMS);
    expect(getRolePolicy).toHaveBeenCalledWith(2, 7);
  });
});
