import {
  ConflictException,
  type HttpException,
  UnauthorizedException,
} from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import type { SecurityAuditService } from '../security-audit/security-audit.service';
import { SETUP_TOKEN_MAX_LENGTH } from './identity.constants';
import { hashPassword } from './password-hasher';
import { OwnerSetupService, SetupClosedError } from './owner-setup.service';

jest.mock('./password-hasher', () => ({
  hashPassword: jest.fn(() => Promise.resolve('hash')),
}));

const TOKEN = 'unit-test-setup-token-0123456789abcdef';
const PASSWORD = 'correct horse battery staple';
const META = { ip: '203.0.113.9' };
const GOOD_BODY = {
  setupToken: TOKEN,
  email: 'Owner@Example.test',
  password: PASSWORD,
};

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
  const ownerQueries = jest.fn(() =>
    Promise.resolve(world.owner ? { id: 1 } : null),
  );
  const created = jest.fn((args: { data: { email: string } }) => {
    world.owner = true;
    return Promise.resolve({
      id: 5,
      documentId: 'doc-5',
      email: args.data.email,
    });
  });
  const auditRows: unknown[] = [];
  const tx = {
    $executeRaw: jest.fn(() => Promise.resolve(1)),
    account: {
      findFirst: jest.fn(() => Promise.resolve(world.owner ? { id: 1 } : null)),
      findUnique: jest.fn(() =>
        Promise.resolve(world.emailTaken ? { id: 2 } : null),
      ),
      create: created,
    },
    role: {
      findUnique: jest.fn(() =>
        Promise.resolve(world.roleSeeded ? { id: 1, isSystem: true } : null),
      ),
    },
    auditLog: {
      create: jest.fn((args: { data: unknown }) => {
        auditRows.push(args.data);
        return Promise.resolve();
      }),
    },
  };
  const prisma = {
    account: { findFirst: ownerQueries },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  const standalone: unknown[] = [];
  const audit = {
    recordStandalone: jest.fn((entry: unknown) => {
      standalone.push(entry);
      return Promise.resolve();
    }),
  } as unknown as SecurityAuditService;
  const config = {
    secrets: { ownerSetupToken: token ?? undefined },
  } as unknown as IAppConfig;
  const service = new OwnerSetupService(prisma, audit, config);
  return { service, world, ownerQueries, created, auditRows, standalone };
}

beforeEach(() => {
  jest.mocked(hashPassword).mockClear();
});

async function rejection(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
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

describe('OwnerSetupService.createOwner', () => {
  it('creates the owner, closes the setup and audits the page channel', async () => {
    const { service, ownerQueries, auditRows } = build();
    await expect(service.createOwner(GOOD_BODY, META)).resolves.toEqual({
      email: 'owner@example.test',
    });
    expect(auditRows).toEqual([
      {
        actorId: 5,
        actorType: 'account',
        action: 'owner.created',
        subject: 'accounts',
        targetId: 'doc-5',
        metadata: { channel: 'setup_page' },
        ip: META.ip,
      },
    ]);
    const before = ownerQueries.mock.calls.length;
    await expect(service.isOpen()).resolves.toBe(false);
    expect(ownerQueries.mock.calls.length).toBe(before);
  });

  it('refuses a wrong token with 401, audits it, and never hashes a password', async () => {
    const { service, standalone, created } = build();
    await expect(
      service.createOwner({ ...GOOD_BODY, setupToken: 'nope' }, META),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(created).not.toHaveBeenCalled();
    expect(standalone).toEqual([
      {
        actor: { type: 'account', accountId: null },
        action: 'owner.setup_rejected',
        metadata: { reason: 'bad_token' },
        ip: META.ip,
      },
    ]);
  });

  it('checks the token before the rest of the body (a wrong token with a bad body is 401)', async () => {
    const { service } = build();
    await expect(
      service.createOwner({ setupToken: 'nope', email: 42 }, META),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['a missing token', { email: 'a@b.test', password: PASSWORD }],
    ['a non-string token', { ...GOOD_BODY, setupToken: 123 }],
    [
      'an over-long token',
      { ...GOOD_BODY, setupToken: 'x'.repeat(SETUP_TOKEN_MAX_LENGTH + 1) },
    ],
    ['a non-object body', 'text'],
    ['no body', undefined],
  ])('treats %s as a wrong token', async (_name, body) => {
    const { service, standalone } = build();
    await expect(service.createOwner(body, META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(standalone).toHaveLength(1);
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('rejects a right token with an invalid body as 400 naming fields only', async () => {
    const { service } = build();
    const error = await rejection(
      service.createOwner({ ...GOOD_BODY, password: 'short' }, META),
    );
    expect(error.getStatus()).toBe(400);
    const text = JSON.stringify(error.getResponse());
    expect(text).toContain('password');
    expect(text).not.toContain('short');
    expect(text).not.toContain(TOKEN);
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('answers closed (404) with no token configured, with no audit row for a tokenless submit', async () => {
    const { service, standalone } = build(null);
    await expect(
      service.createOwner({ email: 'a@b.test', password: PASSWORD }, META),
    ).rejects.toBeInstanceOf(SetupClosedError);
    expect(standalone).toEqual([]);
  });

  it('audits a closed submit that carries a token, without any value', async () => {
    const { service, standalone } = build(null);
    await expect(service.createOwner(GOOD_BODY, META)).rejects.toBeInstanceOf(
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
    expect(JSON.stringify(standalone)).not.toContain('example.test');
  });

  it('answers closed when an owner exists, and a second valid submit is closed too', async () => {
    const { service } = build();
    await service.createOwner(GOOD_BODY, META);
    await expect(service.createOwner(GOOD_BODY, META)).rejects.toBeInstanceOf(
      SetupClosedError,
    );
  });

  it('answers closed (and latches) when it loses a race to another owner', async () => {
    const { service, world, ownerQueries } = build();
    await service.isOpen();
    world.owner = true;
    await expect(service.createOwner(GOOD_BODY, META)).rejects.toBeInstanceOf(
      SetupClosedError,
    );
    const before = ownerQueries.mock.calls.length;
    await service.isOpen();
    expect(ownerQueries.mock.calls.length).toBe(before);
  });

  it('answers 409 for an email that exists, and does not promote it', async () => {
    const { service, created } = build(TOKEN, { emailTaken: true });
    await expect(service.createOwner(GOOD_BODY, META)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(created).not.toHaveBeenCalled();
    await expect(service.isOpen()).resolves.toBe(true);
  });

  it('answers 503 when the system roles are not seeded', async () => {
    const { service } = build(TOKEN, { roleSeeded: false });
    const error = await rejection(service.createOwner(GOOD_BODY, META));
    expect(error.getStatus()).toBe(503);
  });
});

describe('OwnerSetupService.onApplicationBootstrap', () => {
  it('does not throw when the database is unreachable', async () => {
    const { service, ownerQueries } = build();
    ownerQueries.mockRejectedValueOnce(new Error('connection refused'));
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('latches at boot when an owner already exists', async () => {
    const { service, ownerQueries } = build(TOKEN, { owner: true });
    await service.onApplicationBootstrap();
    await service.isOpen();
    expect(ownerQueries).toHaveBeenCalledTimes(1);
  });
});
