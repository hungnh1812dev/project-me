import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { OWNER_ROLE_SLUG } from '../../src/modules/access';
import { seedSystemRoles } from '../../src/modules/access/roles/system-roles.seed';
import { seedAccount } from '../../src/modules/identity/cli/seed-account';
import { SEED_ACCOUNT_ERRORS } from '../../src/modules/identity/domain/Identity.constants';
import { verifyPassword } from '../../src/modules/identity/password-hasher';
import {
  ACCOUNT_SEEDED_CHANNEL,
  AUDIT_ACTIONS,
} from '../../src/modules/security-audit';
import { createCoreTemplate } from '../fixtures/core-db.fixture';
import { startPostgres } from '../fixtures/postgres.fixture';

const PASSWORD = 'correct horse battery staple';

describe('seed:account (Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let handle: PrismaHandle;

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    handle = openPrisma(await template.fresh());
    await seedSystemRoles(handle.prisma);
  });

  afterAll(async () => {
    await handle?.close();
    await postgres?.stop();
  });

  const input = (email: string, roleSlug = 'guest') => ({
    email,
    roleSlug,
    isEmail2faEnabled: false,
    password: PASSWORD,
  });

  it('creates an active account whose hash the app verifies, with an audit row', async () => {
    const seeded = await seedAccount(handle.prisma, {
      ...input(' Reader@Example.com ', 'admin'),
      isEmail2faEnabled: true,
    });
    expect(seeded).toEqual({ email: 'reader@example.com', roleSlug: 'admin' });

    const account = await handle.prisma.account.findUniqueOrThrow({
      where: { email: 'reader@example.com' },
    });
    expect(account).toMatchObject({
      status: 'active',
      roleSlug: 'admin',
      is2faEnabled: true,
      twoFaMethod: 'email',
    });
    expect(await verifyPassword(account.passwordHash ?? '', PASSWORD)).toBe(
      true,
    );

    const audit = await handle.prisma.auditLog.findFirstOrThrow({
      where: {
        action: AUDIT_ACTIONS.ACCOUNT_SEEDED,
        targetId: account.documentId,
      },
    });
    expect(audit.actorType).toBe('system');
    expect(audit.metadata).toEqual({
      channel: ACCOUNT_SEEDED_CHANNEL,
      role: 'admin',
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(PASSWORD);
  });

  it('refuses a taken email and leaves the account unchanged', async () => {
    await seedAccount(handle.prisma, input('taken@example.com'));
    const before = await handle.prisma.account.findUniqueOrThrow({
      where: { email: 'taken@example.com' },
    });
    await expect(
      seedAccount(handle.prisma, {
        ...input('taken@example.com', 'admin'),
        password: 'another password entirely',
      }),
    ).rejects.toMatchObject({ code: SEED_ACCOUNT_ERRORS.EMAIL_TAKEN });
    const after = await handle.prisma.account.findUniqueOrThrow({
      where: { email: 'taken@example.com' },
    });
    expect(after).toEqual(before);
  });

  it('refuses the owner role without creating anything', async () => {
    await expect(
      seedAccount(handle.prisma, input('o@example.com', OWNER_ROLE_SLUG)),
    ).rejects.toMatchObject({ code: SEED_ACCOUNT_ERRORS.ROLE_REFUSED });
    expect(
      await handle.prisma.account.count({ where: { email: 'o@example.com' } }),
    ).toBe(0);
  });

  it('refuses a short password and never echoes it', async () => {
    const error = await seedAccount(handle.prisma, {
      ...input('short@example.com'),
      password: 'short',
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: SEED_ACCOUNT_ERRORS.INVALID_INPUT });
    expect((error as Error).message).not.toContain('short@');
    expect((error as Error).message).not.toContain('password: short');
  });
});
