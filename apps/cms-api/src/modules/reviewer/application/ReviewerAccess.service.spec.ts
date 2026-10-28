import {
  DomainError,
  DOMAIN_ERROR_KINDS,
} from '../../../common/errors/Domain.errors';
import type {
  TransactionRunner,
  UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import { UnconfiguredTurnstileVerifier } from '../adapters/Turnstile.client';
import type { AccessTokenService } from '../../identity';
import type { SecurityAuditService } from '../../security-audit';
import type { AccountActor, VersionCache } from '../../access';
import type {
  ReviewerAccountGateway,
  ReviewerRepository,
  TurnstileVerifier,
} from './Reviewer.port';
import {
  deriveReviewerIpKey,
  ReviewerAccessService,
} from './ReviewerAccess.service';

const SESSION_REQUEST = {
  visitorRole: 'Recruiter',
  purposeTags: ['hiring'],
  notes: 'hello',
  turnstileToken: 'token',
};
const IP_KEY = deriveReviewerIpKey('p'.repeat(32));
const NOW_MS = 1_000_000;

/** Runs the work, then the after-commit callbacks, like the Prisma runner. */
const inlineRunner: TransactionRunner = {
  async run(work) {
    const callbacks: (() => void)[] = [];
    const unit: UnitOfWork = { afterCommit: (cb) => callbacks.push(cb) };
    const result = await work(unit);
    callbacks.forEach((cb) => cb());
    return result;
  },
};

function serviceWith(
  overrides: {
    reviewers?: Partial<ReviewerRepository>;
    accounts?: Partial<ReviewerAccountGateway>;
    turnstile?: TurnstileVerifier;
    versions?: Partial<VersionCache>;
    audit?: Partial<SecurityAuditService>;
    isFeatureEnabled?: boolean;
  } = {},
): ReviewerAccessService {
  return new ReviewerAccessService(
    {
      isEnabled: () => Promise.resolve(true),
      ...overrides.reviewers,
    } as ReviewerRepository,
    { ...overrides.accounts } as ReviewerAccountGateway,
    inlineRunner,
    overrides.turnstile ?? new UnconfiguredTurnstileVerifier(),
    IP_KEY,
    { now: () => NOW_MS },
    { ...overrides.versions } as VersionCache,
    { ...overrides.audit } as SecurityAuditService,
    {} as AccessTokenService,
    overrides.isFeatureEnabled ?? true,
  );
}

async function kindOf(promise: Promise<unknown>): Promise<unknown> {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  return error instanceof DomainError ? error.kind : error;
}

describe('ReviewerAccessService.createSession', () => {
  it('answers unavailable and never calls verify when Turnstile is not configured', async () => {
    const turnstile = new UnconfiguredTurnstileVerifier();
    const verify = jest.spyOn(turnstile, 'verify');
    const isEnabled = jest.fn();
    const service = serviceWith({ turnstile, reviewers: { isEnabled } });

    await expect(
      kindOf(service.createSession(SESSION_REQUEST, '203.0.113.9', 'agent')),
    ).resolves.toBe(DOMAIN_ERROR_KINDS.UNAVAILABLE);
    expect(verify).not.toHaveBeenCalled();
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('refuses a disabled reviewer access before it spends a Turnstile call', async () => {
    const verify = jest.fn();
    const service = serviceWith({
      turnstile: { isConfigured: true, verify },
      reviewers: { isEnabled: () => Promise.resolve(false) },
    });

    await expect(
      kindOf(service.createSession(SESSION_REQUEST, '203.0.113.9', 'agent')),
    ).resolves.toBe(DOMAIN_ERROR_KINDS.FORBIDDEN);
    expect(verify).not.toHaveBeenCalled();
  });

  it('refuses a token Cloudflare rejected', async () => {
    const service = serviceWith({
      turnstile: {
        isConfigured: true,
        verify: () => Promise.resolve('failed'),
      },
      reviewers: {
        countActiveSessions: () => Promise.resolve(0),
        findLastSessionStartOf: () => Promise.resolve(undefined),
      },
    });

    await expect(
      kindOf(service.createSession(SESSION_REQUEST, '203.0.113.9', 'agent')),
    ).resolves.toBe(DOMAIN_ERROR_KINDS.INVALID_INPUT);
  });
});

describe('ReviewerAccessService.updateSettings', () => {
  const actor = {
    kind: 'account',
    accountId: 7,
    roleSlug: 'admin',
  } as unknown as AccountActor;
  const meta = { ip: '203.0.113.9' } as never;

  it('drops the role and the revoked accounts from the cache only after the unit commits', async () => {
    const order: string[] = [];
    const service = serviceWith({
      reviewers: { saveEnabled: () => Promise.resolve() },
      accounts: {
        bumpRolePolicyVersion: () => Promise.resolve(3),
        revokeAllSessions: () => Promise.resolve([11, 12]),
      },
      audit: {
        record: () => {
          order.push('audit');
          return Promise.resolve();
        },
      },
      versions: {
        invalidateRole: (id: number) => order.push(`role:${id}`),
        invalidateAccount: (id: number) => order.push(`account:${id}`),
      },
    });

    await expect(
      service.updateSettings(actor, { enabled: false }, meta),
    ).resolves.toEqual({ enabled: false });
    expect(order).toEqual(['audit', 'role:3', 'account:11', 'account:12']);
  });

  it('switching on revokes no session', async () => {
    const revokeAllSessions = jest.fn();
    const service = serviceWith({
      reviewers: { saveEnabled: () => Promise.resolve() },
      accounts: {
        bumpRolePolicyVersion: () => Promise.resolve(3),
        revokeAllSessions,
      },
      audit: { record: () => Promise.resolve() },
      versions: { invalidateRole: jest.fn() },
    });

    await service.updateSettings(actor, { enabled: true }, meta);
    expect(revokeAllSessions).not.toHaveBeenCalled();
  });
});

describe('ReviewerAccessService with the deploy switch off (ADR 0014)', () => {
  const actor = { kind: 'account', accountId: 7 } as unknown as AccountActor;
  const meta = { ip: '203.0.113.9' } as never;

  /** Any method call on a collaborator means the service went past the switch. */
  function untouchable<T extends object>(name: string): T {
    return new Proxy({} as T, {
      get: (_target, property) => () => {
        throw new Error(`${name}.${String(property)} was called`);
      },
    });
  }

  function offService(): ReviewerAccessService {
    return new ReviewerAccessService(
      untouchable('reviewers'),
      untouchable('accounts'),
      untouchable('transactions'),
      untouchable('turnstile'),
      IP_KEY,
      untouchable('clock'),
      untouchable('versions'),
      untouchable('audit'),
      untouchable('tokens'),
      false,
    );
  }

  it.each([
    ['status', (s: ReviewerAccessService) => s.status()],
    [
      'createSession',
      (s: ReviewerAccessService) =>
        s.createSession(SESSION_REQUEST, '203.0.113.9', 'agent'),
    ],
    [
      'listSessions',
      (s: ReviewerAccessService) => s.listSessions({ page: 1, pageSize: 20 }),
    ],
    [
      'updateSettings',
      (s: ReviewerAccessService) =>
        s.updateSettings(actor, { enabled: true }, meta),
    ],
  ])(
    '%s answers 404 REVIEWER_FEATURE_OFF and touches no collaborator',
    async (_name, call) => {
      const error: unknown = await call(offService()).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
        errorCode: 'REVIEWER_FEATURE_OFF',
      });
    },
  );
});

describe('deriveReviewerIpKey', () => {
  it('is 32 bytes, stable, and absent without a pepper', () => {
    expect(IP_KEY?.length).toBe(32);
    expect(
      deriveReviewerIpKey('p'.repeat(32))?.equals(IP_KEY ?? Buffer.alloc(0)),
    ).toBe(true);
    expect(deriveReviewerIpKey(undefined)).toBeUndefined();
  });
});
