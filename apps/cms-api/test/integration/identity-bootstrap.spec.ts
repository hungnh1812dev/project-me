import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';

import {
  openPrisma,
  type PrismaClient,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { SYSTEM_ROLES } from '../../src/modules/access/domain/SystemRoles.entity';
import { OWNER_BOOTSTRAP_ERRORS } from '../../src/modules/identity/domain/Identity.constants';
import {
  OwnerBootstrapError,
  type OwnerBootstrapInput,
  type OwnerBootstrapOptions,
} from '../../src/modules/identity/application/OwnerBootstrap.service';
import { identityUseCasesOf } from '../../src/modules/identity/cli/IdentityCli.setup';
import { verifyPassword } from '../../src/modules/identity/application/Password.service';
import { createCoreTemplate } from '../fixtures/core-db.fixture';
import { startPostgres } from '../fixtures/postgres.fixture';
import { seedSystemRoles } from '../fixtures/access.fixture';

function bootstrapOwner(
  prisma: PrismaClient,
  input: OwnerBootstrapInput,
  options?: OwnerBootstrapOptions,
) {
  return identityUseCasesOf(prisma).ownerBootstrap.bootstrap(input, options);
}

const PASSWORD = 'correct horse battery staple';
const CONCURRENT_RUNS = 5;
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const INTEGRITY_VIOLATION = '23000';

function owner(email: string) {
  return { email, password: PASSWORD };
}

describe('core schema, system roles and owner:bootstrap (Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let template: Awaited<ReturnType<typeof createCoreTemplate>>;
  const handles: PrismaHandle[] = [];

  beforeAll(async () => {
    postgres = await startPostgres();
    template = await createCoreTemplate(postgres.getConnectionUri());
  });

  afterAll(async () => {
    await Promise.all(handles.map((handle) => handle.close()));
    await postgres?.stop();
  });

  function connect(databaseUrl: string): PrismaHandle {
    const handle = openPrisma(databaseUrl);
    handles.push(handle);
    return handle;
  }

  /** Fresh migrated DB; seeded unless asked not to. */
  async function database(seed = true) {
    const url = await template.fresh();
    const { prisma } = connect(url);
    if (seed) await seedSystemRoles(prisma);
    return { url, prisma };
  }

  /** Raw SQL with pg, to bypass Prisma (and any app-level check). */
  async function rawQuery(url: string, text: string, values: unknown[] = []) {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      return await client.query(text, values);
    } finally {
      await client.end();
    }
  }

  async function sqlErrorCode(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (error) {
      return (error as { code: string }).code;
    }
    throw new Error('expected the query to fail');
  }

  describe('system roles seed', () => {
    it('inserts the six system roles once and is idempotent', async () => {
      const { prisma } = await database(false);
      expect(await seedSystemRoles(prisma)).toEqual(
        SYSTEM_ROLES.map((role) => role.slug),
      );
      expect(await seedSystemRoles(prisma)).toEqual([]);

      const roles = await prisma.role.findMany({
        select: { slug: true, rank: true, isSystem: true },
        orderBy: { rank: 'asc' },
      });
      expect(roles).toEqual(
        SYSTEM_ROLES.map(({ slug, rank }) => ({ slug, rank, isSystem: true })),
      );
    });

    it('keeps names edited after seeding', async () => {
      const { prisma } = await database();
      await prisma.role.update({
        where: { slug: 'editor' },
        data: { name: 'Writer' },
      });
      await seedSystemRoles(prisma);
      expect(
        (await prisma.role.findUnique({ where: { slug: 'editor' } }))?.name,
      ).toBe('Writer');
    });

    it('keeps system slug/rank immutable and undeletable in the database', async () => {
      const { url } = await database();
      expect(
        await sqlErrorCode(
          rawQuery(url, `UPDATE roles SET rank = 50 WHERE slug = 'owner'`),
        ),
      ).toBe(INTEGRITY_VIOLATION);
      expect(
        await sqlErrorCode(
          rawQuery(url, `UPDATE roles SET slug = 'boss' WHERE slug = 'owner'`),
        ),
      ).toBe(INTEGRITY_VIOLATION);
      expect(
        await sqlErrorCode(
          rawQuery(url, `DELETE FROM roles WHERE slug = 'guest'`),
        ),
      ).toBe(INTEGRITY_VIOLATION);
      // Custom roles must stay within 11-39.
      expect(
        await sqlErrorCode(
          rawQuery(
            url,
            `INSERT INTO roles (document_id, slug, name, rank) VALUES (gen_random_uuid(), 'boss', 'Boss', 50)`,
          ),
        ),
      ).toBe(CHECK_VIOLATION);
    });
  });

  describe('owner:bootstrap', () => {
    it('creates an active owner with an Argon2id hash, then refuses a second run', async () => {
      const { prisma } = await database();
      const created = await bootstrapOwner(prisma, {
        ...owner('Owner@Example.com'),
        displayName: 'Hung',
      });
      expect(created.email).toBe('owner@example.com');

      const account = await prisma.account.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(account).toMatchObject({
        roleSlug: 'owner',
        status: 'active',
        displayName: 'Hung',
        deletedAt: null,
      });
      expect(account.passwordHash).toMatch(/^\$argon2id\$/);
      expect(await verifyPassword(account.passwordHash ?? '', PASSWORD)).toBe(
        true,
      );

      await expect(
        bootstrapOwner(prisma, owner('second@example.com')),
      ).rejects.toMatchObject({ code: OWNER_BOOTSTRAP_ERRORS.OWNER_EXISTS });
      expect(await prisma.account.count()).toBe(1);
    });

    it('leaves exactly one owner when runs race', async () => {
      const { url } = await database();
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENT_RUNS }, (_, index) =>
          bootstrapOwner(
            connect(url).prisma,
            owner(`racer${index}@example.com`),
          ),
        ),
      );
      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason as unknown] : [],
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(CONCURRENT_RUNS - 1);
      for (const reason of rejected) {
        expect(reason).toBeInstanceOf(OwnerBootstrapError);
        expect((reason as OwnerBootstrapError).code).toBe(
          OWNER_BOOTSTRAP_ERRORS.OWNER_EXISTS,
        );
      }
      const owners = await rawQuery(
        url,
        `SELECT count(*)::int AS count FROM accounts WHERE role_slug = 'owner'`,
      );
      expect(owners.rows).toEqual([{ count: 1 }]);
    });

    it('refuses before the roles are seeded', async () => {
      const { prisma } = await database(false);
      await expect(
        bootstrapOwner(prisma, owner('owner@example.com')),
      ).rejects.toMatchObject({ code: OWNER_BOOTSTRAP_ERRORS.ROLE_MISSING });
    });

    it('never promotes an existing account', async () => {
      const { prisma } = await database();
      await prisma.account.create({
        data: {
          email: 'editor@example.com',
          displayName: 'Editor',
          role: { connect: { slug: 'editor' } },
        },
      });
      await expect(
        bootstrapOwner(prisma, owner('EDITOR@example.com')),
      ).rejects.toMatchObject({ code: OWNER_BOOTSTRAP_ERRORS.EMAIL_TAKEN });
    });

    it('rejects a short password without echoing it', async () => {
      const { prisma } = await database();
      const secret = 'short-pw';
      const error = await bootstrapOwner(prisma, {
        email: 'owner@example.com',
        password: secret,
      }).catch((reason: unknown) => reason);
      expect(error).toMatchObject({
        code: OWNER_BOOTSTRAP_ERRORS.INVALID_INPUT,
      });
      expect((error as Error).message).not.toContain(secret);
    });
  });

  describe('single-owner partial unique index (D1)', () => {
    it('rejects a second live owner inserted directly, allows one after a soft delete', async () => {
      const { url, prisma } = await database();
      const first = await bootstrapOwner(prisma, owner('owner@example.com'));
      const insertOwner = (email: string) =>
        rawQuery(
          url,
          `INSERT INTO accounts (document_id, email, display_name, role_id, role_slug)
           SELECT gen_random_uuid(), $1, 'x', id, slug FROM roles WHERE slug = 'owner'`,
          [email],
        );

      expect(await sqlErrorCode(insertOwner('intruder@example.com'))).toBe(
        UNIQUE_VIOLATION,
      );

      await rawQuery(
        url,
        `UPDATE accounts SET deleted_at = now() WHERE id = $1`,
        [first.id],
      );
      await expect(insertOwner('next@example.com')).resolves.toBeDefined();
    });

    it('keeps role_slug equal to the role through the composite FK', async () => {
      const { url } = await database();
      expect(
        await sqlErrorCode(
          rawQuery(
            url,
            `INSERT INTO accounts (document_id, email, display_name, role_id, role_slug)
             SELECT gen_random_uuid(), 'fake@example.com', 'x', id, 'owner' FROM roles WHERE slug = 'guest'`,
          ),
        ),
      ).toBe('23503');
    });
  });
});
