import {
  applyDatabaseRoles,
  DDL_REFUSED_FOR_API_ROLE,
  type DatabaseRoleNames,
  dropRoles,
  failureCodeOf,
  grantSnapshotOf,
  INSUFFICIENT_PRIVILEGE,
  loginUrlOf,
  META_TABLE_WRITES_REFUSED_FOR_API_ROLE,
  migrateContent,
  migrateCore,
  randomRoleName,
  rowsOf,
} from '../fixtures/CoreDb.fixture';
import { PrismaService } from '../../src/infrastructure/database/Prisma.service';
import { APP_LOGGER } from '../../src/infrastructure/logging/AppLogger.port';
import { dbEnvOf, productionEnv } from '../fixtures/Env.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';
import {
  SHARED_POSTGRES_URL_ENV,
  startPostgres,
  type TestPostgres,
} from '../fixtures/Postgres.fixture';

const SETUP_TIMEOUT_MS = 180_000;
const TEMPORARY_TABLE = 'CREATE TEMP TABLE denied_probe (id int)';

describe('database roles script, hosting=self_managed (ADR 0012)', () => {
  let postgres: TestPostgres;
  let serverUrl: string;
  let database: string;
  let roles: DatabaseRoleNames;
  let otherRole: string;
  let superuserUrl: string;
  let migratorUrl: string;
  let apiUrl: string;
  let backupUrl: string;

  const run = (options?: Parameters<typeof applyDatabaseRoles>[3]) =>
    applyDatabaseRoles(serverUrl, database, roles, options);

  beforeAll(async () => {
    postgres = await startPostgres();
    const url = new URL(postgres.getConnectionUri());
    serverUrl = process.env[SHARED_POSTGRES_URL_ENV] as string;
    database = decodeURIComponent(url.pathname.slice(1));
    superuserUrl = postgres.getConnectionUri();
    roles = {
      migrator: randomRoleName('t_migrator'),
      api: randomRoleName('t_api'),
      backup: randomRoleName('t_backup'),
    };
    otherRole = randomRoleName('t_other');

    await run();
    migratorUrl = await loginUrlOf(serverUrl, database, roles.migrator);
    apiUrl = await loginUrlOf(serverUrl, database, roles.api);
    backupUrl = await loginUrlOf(serverUrl, database, roles.backup);
    await migrateCore(migratorUrl);
    await migrateContent(migratorUrl);
    await run();
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await postgres?.stop();
    await dropRoles(serverUrl, [
      roles.migrator,
      roles.api,
      roles.backup,
      otherRole,
    ]);
  });

  it('makes the migrator the database owner and takes PUBLIC rights away', async () => {
    const [owner] = await rowsOf<{ owner: string; has_acl: boolean }>(
      superuserUrl,
      `SELECT datdba::regrole::text AS owner, datacl IS NOT NULL AS has_acl
       FROM pg_database WHERE datname = $1`,
      [database],
    );
    expect(owner).toEqual({ owner: roles.migrator, has_acl: true });

    const publicRights = await rowsOf<{ privilege_type: string }>(
      superuserUrl,
      `SELECT a.privilege_type FROM pg_database d, aclexplode(d.datacl) a
       WHERE d.datname = $1 AND a.grantee = 0
       UNION ALL
       SELECT a.privilege_type FROM pg_namespace n, aclexplode(n.nspacl) a
       WHERE n.nspname = 'public' AND a.grantee = 0 AND a.privilege_type = 'CREATE'`,
      [database],
    );
    expect(publicRights).toEqual([]);

    await rowsOf(superuserUrl, `CREATE ROLE "${otherRole}" LOGIN`);
    const otherUrl = await loginUrlOf(serverUrl, database, otherRole);
    expect(await failureCodeOf(otherUrl, 'SELECT 1')).toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('gives the roles no password and no privileged attribute', async () => {
    const attributes = await rowsOf<{ rolname: string; flags: boolean }>(
      superuserUrl,
      `SELECT rolname,
              (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication) AS flags
       FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname`,
      [[roles.migrator, roles.api, roles.backup]],
    );
    expect(attributes).toHaveLength(3);
    expect(attributes.every((role) => !role.flags)).toBe(true);
  });

  it('lets the API role do DML in public and content', async () => {
    await rowsOf(
      apiUrl,
      `INSERT INTO public.app_settings ("key", "value") VALUES ('probe', '1')`,
    );
    await rowsOf(
      apiUrl,
      `UPDATE public.app_settings SET "value" = '2' WHERE "key" = 'probe'`,
    );
    expect(
      await rowsOf(
        apiUrl,
        `SELECT 1 FROM public.app_settings WHERE "key" = 'probe'`,
      ),
    ).toHaveLength(1);
    await rowsOf(
      apiUrl,
      `DELETE FROM public.app_settings WHERE "key" = 'probe'`,
    );

    await rowsOf(
      apiUrl,
      `INSERT INTO content.profile ("document_id", "name") VALUES (gen_random_uuid(), 'probe')`,
    );
    await rowsOf(apiUrl, `DELETE FROM content.profile WHERE "name" = 'probe'`);
  });

  it('covers a table created later by the migrator, serial sequence included', async () => {
    await rowsOf(
      migratorUrl,
      `CREATE TABLE content.later_probe (id serial PRIMARY KEY, label text)`,
    );
    await rowsOf(
      apiUrl,
      `INSERT INTO content.later_probe (label) VALUES ('a')`,
    );
    expect(
      await rowsOf(backupUrl, `SELECT 1 FROM content.later_probe`),
    ).toHaveLength(1);
  });

  it.each(DDL_REFUSED_FOR_API_ROLE)('refuses the API role: %s', async (ddl) => {
    expect(await failureCodeOf(apiUrl, ddl)).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('refuses temporary tables for the API role', async () => {
    expect(await failureCodeOf(apiUrl, TEMPORARY_TABLE)).toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it.each(META_TABLE_WRITES_REFUSED_FOR_API_ROLE)(
    'refuses the API role a meta table write: %s',
    async (statement) => {
      expect(await failureCodeOf(apiUrl, statement)).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    },
  );

  it('lets the API role read the content type definitions', async () => {
    expect(
      (await rowsOf(apiUrl, 'SELECT slug FROM content._content_types')).length,
    ).toBeGreaterThan(0);
    await rowsOf(apiUrl, 'SELECT 1 FROM public._prisma_migrations');
    await rowsOf(apiUrl, 'SELECT 1 FROM content._migrations');
  });

  it('lets the backup role read every app table and write none', async () => {
    const tables = await rowsOf<{ name: string }>(
      superuserUrl,
      `SELECT format('%I.%I', n.nspname, c.relname) AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('public', 'content') AND c.relkind = 'r'`,
    );
    expect(tables.length).toBeGreaterThan(10);
    for (const { name } of tables) {
      await rowsOf(backupUrl, `SELECT count(*) FROM ${name}`);
    }
    for (const statement of [
      `INSERT INTO public.app_settings DEFAULT VALUES`,
      `UPDATE public.app_settings SET "key" = 'x'`,
      `DELETE FROM content.profile`,
      `TRUNCATE public.app_settings`,
      'CREATE TABLE public.denied_probe (id int)',
      TEMPORARY_TABLE,
    ]) {
      expect(await failureCodeOf(backupUrl, statement)).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    }
  });

  it('changes nothing when it runs again', async () => {
    const before = await grantSnapshotOf(superuserUrl, database);
    await run();
    expect(await grantSnapshotOf(superuserUrl, database)).toEqual(before);
  });

  it('stops without a valid hosting or role variable', async () => {
    await expect(
      run({ extraVariables: { hosting: undefined } }),
    ).rejects.toThrow(/hosting must be/);
    await expect(run({ hosting: 'elsewhere' })).rejects.toThrow(
      /hosting must be/,
    );
    await expect(
      run({ extraVariables: { migrator_role: undefined } }),
    ).rejects.toThrow(/migrator_role is required/);
    await expect(
      run({ extraVariables: { api_role: roles.backup } }),
    ).rejects.toThrow(/three different roles/);
  });

  it('fails its self-check when the API role may create in public', async () => {
    await rowsOf(
      superuserUrl,
      `GRANT CREATE ON SCHEMA public TO "${roles.api}"`,
    );
    await expect(run()).rejects.toThrow(
      new RegExp(
        `self-check failed.*${roles.api} can create objects in schema public`,
      ),
    );
    await rowsOf(
      superuserUrl,
      `REVOKE CREATE ON SCHEMA public FROM "${roles.api}"`,
    );
    await run();
  });

  it('fails its self-check when the backup role may write', async () => {
    await rowsOf(
      superuserUrl,
      `GRANT INSERT ON public.app_settings TO "${roles.backup}"`,
    );
    await expect(run()).rejects.toThrow(
      new RegExp(
        `self-check failed.*${roles.backup} can write public.app_settings`,
      ),
    );
    await rowsOf(
      superuserUrl,
      `REVOKE INSERT ON public.app_settings FROM "${roles.backup}"`,
    );
    await run();
  });

  it.each([
    ['api', 'pg_execute_server_program'],
    ['backup', 'pg_signal_backend'],
  ] as const)(
    'fails its self-check when the %s role is a member of %s',
    async (which, group) => {
      await rowsOf(superuserUrl, `GRANT ${group} TO "${roles[which]}"`);
      await expect(run()).rejects.toThrow(
        new RegExp(
          `self-check failed.*${roles[which]} is a member of role ${group}`,
        ),
      );
      await rowsOf(superuserUrl, `REVOKE ${group} FROM "${roles[which]}"`);
      await run();
    },
  );

  it('fails its self-check when the API role is a member of the migrator role', async () => {
    await rowsOf(superuserUrl, `GRANT "${roles.migrator}" TO "${roles.api}"`);
    await expect(run()).rejects.toThrow(
      new RegExp(
        `self-check failed.*${roles.api} is a member of role ${roles.migrator}`,
      ),
    );
    await rowsOf(
      superuserUrl,
      `REVOKE "${roles.migrator}" FROM "${roles.api}"`,
    );
    await run();
  });

  it('repairs a meta table write right instead of keeping it', async () => {
    await rowsOf(
      superuserUrl,
      `GRANT UPDATE ON content._content_types TO "${roles.api}"`,
    );
    await run();
    expect(
      await failureCodeOf(
        apiUrl,
        `UPDATE content._content_types SET slug = 'x'`,
      ),
    ).toBe(INSUFFICIENT_PRIVILEGE);
  });

  describe('production boot warning (ADR 0012 section 7)', () => {
    async function warningsWhenBootedAs(databaseUrl: string) {
      const warn = jest.fn();
      const app = await createTestApp(productionEnv(dbEnvOf(databaseUrl)), [
        { token: APP_LOGGER, value: { warn, error: jest.fn() } },
      ]);
      try {
        await app.get(PrismaService).roleCheck;
      } finally {
        await app.close();
      }
      return warn.mock.calls.map(([message]) => message as string);
    }

    it('starts and warns once, by problem name, as the migrator', async () => {
      const warnings = await warningsWhenBootedAs(migratorUrl);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('owns objects in schema public');
      expect(warnings[0]).toContain('owns objects in schema content');
      expect(warnings[0]).not.toContain(roles.migrator);
    });

    it('warns by role name when the API role is a member of another role', async () => {
      await rowsOf(superuserUrl, `GRANT pg_signal_backend TO "${roles.api}"`);
      try {
        const warnings = await warningsWhenBootedAs(apiUrl);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('member of role pg_signal_backend');
      } finally {
        await rowsOf(
          superuserUrl,
          `REVOKE pg_signal_backend FROM "${roles.api}"`,
        );
      }
    });

    it('starts with no warning as the API role', async () => {
      expect(await warningsWhenBootedAs(apiUrl)).toEqual([]);
    });
  });
});
