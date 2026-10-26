import { type IAppConfig } from '../../../config/app-config';
import type { AppLogger } from '../../../infrastructure/logging/AppLogger.port';
import type {
  TransactionRunner,
  UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import type { SecurityAuditService } from '../../security-audit';
import {
  DomainError,
  DOMAIN_ERROR_KINDS,
} from '../../../common/errors/Domain.errors';
import { SETUP_TOKEN_MAX_LENGTH } from '../domain/Identity.constants';
import type { AccountRepository, AuditRecorder } from './Identity.port';
import { OwnerBootstrapService } from './OwnerBootstrap.service';
import { OwnerSetupService, SetupClosedError } from './OwnerSetup.service';
import { hashPassword } from './Password.service';

jest.mock('./Password.service', () => ({
  hashPassword: jest.fn(() => Promise.resolve('hash')),
}));

const TOKEN = 'unit-test-setup-token-0123456789abcdef';
const PASSWORD = 'correct horse battery staple';
const META = { ip: '203.0.113.9' };
const OWNER_INPUT = { email: 'owner@example.test', password: PASSWORD };

interface World {
  /** A live owner exists. */
  owner: boolean;
  /** An account already holds the submitted email. */
  emailTaken: boolean;
  roleSeeded: boolean;
}

function build(token: string | null = TOKEN, state?: Partial<World>) {
  const world: World = {
    owner: false,
    emailTaken: false,
    roleSeeded: true,
    ...state,
  };
  const ownerQueries = jest.fn(() => Promise.resolve(world.owner));
  const created = jest.fn((_unit: UnitOfWork, account: { email: string }) => {
    world.owner = true;
    return Promise.resolve({
      id: 5,
      documentId: 'doc-5',
      email: account.email,
    });
  });
  const accounts = {
    hasLiveOwner: ownerQueries,
    lockOwnerCreation: jest.fn(() => Promise.resolve()),
    findRole: jest.fn(() =>
      Promise.resolve(world.roleSeeded ? { id: 1, isSystem: true } : null),
    ),
    isEmailTaken: jest.fn(() => Promise.resolve(world.emailTaken)),
    createAccount: created,
  } as unknown as AccountRepository;
  const unit = { afterCommit: jest.fn() } as UnitOfWork;
  const runner: TransactionRunner = { run: (work) => work(unit) };
  const auditRows: unknown[] = [];
  const recorder: AuditRecorder = {
    record: (_unit, entry) => {
      auditRows.push(entry);
      return Promise.resolve();
    },
  };
  const standalone: unknown[] = [];
  const audit = {
    recordStandalone: jest.fn((entry: unknown) => {
      standalone.push(entry);
      return Promise.resolve();
    }),
  } as unknown as SecurityAuditService;
  const warn = jest.fn();
  const logger: AppLogger = { warn, error: jest.fn() };
  const config = {
    secrets: { ownerSetupToken: token ?? undefined },
  } as unknown as IAppConfig;
  const service = new OwnerSetupService(
    accounts,
    audit,
    new OwnerBootstrapService(accounts, runner, recorder),
    logger,
    config,
  );
  return {
    service,
    world,
    ownerQueries,
    created,
    auditRows,
    standalone,
    warn,
  };
}

beforeEach(() => {
  jest.mocked(hashPassword).mockClear();
});

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

describe('OwnerSetupService.isOpen', () => {
  it('is closed without a configured token and never queries', async () => {
    const { service, ownerQueries } = build(null);
    await expect(service.isOpen()).resolves.toBe(false);
    expect(ownerQueries).not.toHaveBeenCalled();
  });

  it('is open with a token and no owner', async () => {
    const { service } = build();
    await expect(service.isOpen()).resolves.toBe(true);
  });

  it('is closed when an owner exists, and then stops querying (latch)', async () => {
    const { service, ownerQueries } = build(TOKEN, { owner: true });
    await expect(service.isOpen()).resolves.toBe(false);
    await expect(service.isOpen()).resolves.toBe(false);
    await expect(service.isOpen()).resolves.toBe(false);
    expect(ownerQueries).toHaveBeenCalledTimes(1);
  });
});

describe('OwnerSetupService.admit', () => {
  it('lets the configured token through without any write', async () => {
    const { service, standalone } = build();
    await expect(service.admit(TOKEN, META)).resolves.toBeUndefined();
    expect(standalone).toEqual([]);
  });

  it('refuses a wrong token with 401 and audits it', async () => {
    const { service, standalone } = build();
    const error = await rejection(service.admit('nope', META));
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).kind).toBe(
      DOMAIN_ERROR_KINDS.UNAUTHENTICATED,
    );
    expect(standalone).toEqual([
      {
        actor: { type: 'account', accountId: null },
        action: 'owner.setup_rejected',
        metadata: { reason: 'bad_token' },
        ip: META.ip,
      },
    ]);
  });

  it.each([
    ['a missing token', undefined],
    ['a non-string token', 123],
    ['an over-long token', 'x'.repeat(SETUP_TOKEN_MAX_LENGTH + 1)],
  ])('treats %s as a wrong token', async (_name, submitted) => {
    const { service, standalone } = build();
    await expect(service.admit(submitted, META)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(standalone).toHaveLength(1);
  });

  it('answers closed with no token configured, and audits nothing for a tokenless submit', async () => {
    const { service, standalone } = build(null);
    await expect(service.admit(undefined, META)).rejects.toBeInstanceOf(
      SetupClosedError,
    );
    expect(standalone).toEqual([]);
  });

  it('audits a closed submit that carries a token, without any value', async () => {
    const { service, standalone } = build(null);
    await expect(service.admit(TOKEN, META)).rejects.toBeInstanceOf(
      SetupClosedError,
    );
    expect(standalone).toEqual([
      {
        actor: { type: 'account', accountId: null },
        action: 'owner.setup_rejected',
        metadata: { reason: 'closed' },
        ip: META.ip,
      },
    ]);
    expect(JSON.stringify(standalone)).not.toContain(TOKEN);
  });

  it('answers closed when an owner exists', async () => {
    const { service } = build(TOKEN, { owner: true });
    await expect(service.admit(TOKEN, META)).rejects.toBeInstanceOf(
      SetupClosedError,
    );
  });
});

describe('OwnerSetupService.createOwner', () => {
  it('creates the owner, closes the setup, warns and audits the page channel', async () => {
    const { service, ownerQueries, auditRows, warn } = build();
    await expect(service.createOwner(OWNER_INPUT, META)).resolves.toEqual({
      email: 'owner@example.test',
    });
    expect(auditRows).toEqual([
      {
        actor: { type: 'account', accountId: 5 },
        action: 'owner.created',
        subject: 'accounts',
        targetId: 'doc-5',
        metadata: { channel: 'setup_page' },
        ip: META.ip,
      },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    const before = ownerQueries.mock.calls.length;
    await expect(service.isOpen()).resolves.toBe(false);
    expect(ownerQueries.mock.calls.length).toBe(before);
  });

  it('answers closed (and latches) when it loses a race to another owner', async () => {
    const { service, world, ownerQueries, standalone } = build();
    await service.isOpen();
    world.owner = true;
    await expect(service.createOwner(OWNER_INPUT, META)).rejects.toBeInstanceOf(
      SetupClosedError,
    );
    expect(standalone).toHaveLength(1);
    const before = ownerQueries.mock.calls.length;
    await service.isOpen();
    expect(ownerQueries.mock.calls.length).toBe(before);
  });

  it('answers 409 for an email that exists, and does not promote it', async () => {
    const { service, created } = build(TOKEN, { emailTaken: true });
    const error = await rejection(service.createOwner(OWNER_INPUT, META));
    expect((error as DomainError).kind).toBe(DOMAIN_ERROR_KINDS.CONFLICT);
    expect(created).not.toHaveBeenCalled();
    await expect(service.isOpen()).resolves.toBe(true);
  });

  it('answers 503 when the system roles are not seeded', async () => {
    const { service } = build(TOKEN, { roleSeeded: false });
    const error = await rejection(service.createOwner(OWNER_INPUT, META));
    expect((error as DomainError).kind).toBe(DOMAIN_ERROR_KINDS.UNAVAILABLE);
  });
});

describe('OwnerSetupService.warnWhenTokenOutlivesSetup', () => {
  it('does not throw when the database is unreachable', async () => {
    const { service, ownerQueries } = build();
    ownerQueries.mockRejectedValueOnce(new Error('connection refused'));
    await expect(service.warnWhenTokenOutlivesSetup()).resolves.toBeUndefined();
  });

  it('latches at boot when an owner already exists', async () => {
    const { service, ownerQueries, warn } = build(TOKEN, { owner: true });
    await service.warnWhenTokenOutlivesSetup();
    await service.isOpen();
    expect(ownerQueries).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
