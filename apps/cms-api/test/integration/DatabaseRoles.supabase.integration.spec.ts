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
  urlAs,
} from '../fixtures/CoreDb.fixture';
import {
  SHARED_POSTGRES_URL_ENV,
  startPostgres,
  type TestPostgres,
} from '../fixtures/Postgres.fixture';

const SETUP_TIMEOUT_MS = 180_000;
const EXISTING_API_PASSWORD = 'password-set-by-the-user';

/**
 * Supabase stand-in on the shared server: the migrator is a CREATEROLE role
 * (not a superuser, not the database owner) and three roles that get
 * Supabase's old default grants on every table the migrator creates.
 */
describe('database roles script, hosting=supabase (ADR 0012 section 9)', () => {
  let postgres: TestPostgres;
  let serverUrl: string;
  let database: string;
  let roles: DatabaseRoleNames;
  let dataApiRoles: string[];
  let superuserUrl: string;
  let migratorUrl: string;
  let apiUrl: string;
  let backupUrl: string;
  let beforeRun: Record<string, unknown[]>;

  const migratorPassword = 'stand-in-migrator-password';

  const run = (options?: Parameters<typeof applyDatabaseRoles>[3]) =>
    applyDatabaseRoles(serverUrl, database, roles, {
      hosting: 'supabase',
      connectAs: { user: roles.migrator, password: migratorPassword },
      ...options,
      extraVariables: {
        data_api_roles: dataApiRoles.join(','),
        ...options?.extraVariables,
      },
    });

  const ownershipAndPublicRights = () =>
    rowsOf(
      superuserUrl,
      `SELECT d.datdba::regrole::text AS owner, d.datacl::text AS database_acl,
              (SELECT n.nspacl::text FROM pg_namespace n WHERE n.nspname = 'public') AS public_schema_acl
       FROM pg_database d WHERE d.datname = $1`,
      [database],
    );

  beforeAll(async () => {
    postgres = await startPostgres();
    serverUrl = process.env[SHARED_POSTGRES_URL_ENV] as string;
    superuserUrl = postgres.getConnectionUri();
    database = decodeURIComponent(new URL(superuserUrl).pathname.slice(1));
    roles = {
      migrator: randomRoleName('s_migrator'),
      api: randomRoleName('s_api'),
      backup: randomRoleName('s_backup'),
    };
    dataApiRoles = ['s_anon', 's_auth', 's_service'].map(randomRoleName);

    await rowsOf(
      superuserUrl,
      `CREATE ROLE "${roles.migrator}" LOGIN CREATEROLE PASSWORD '${migratorPassword}'`,
    );
    await rowsOf(
      superuserUrl,
      `GRANT CREATE ON DATABASE "${database}" TO "${roles.migrator}"`,
    );
    await rowsOf(
      superuserUrl,
      `GRANT CREATE ON SCHEMA public TO "${roles.migrator}"`,
    );
    for (const dataApiRole of dataApiRoles) {
      await rowsOf(superuserUrl, `CREATE ROLE "${dataApiRole}"`);
      for (const kind of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) {
        await rowsOf(
          superuserUrl,
          `ALTER DEFAULT PRIVILEGES FOR ROLE "${roles.migrator}" IN SCHEMA public GRANT ALL ON ${kind} TO "${dataApiRole}"`,
        );
      }
    }
    migratorUrl = urlAs(serverUrl, database, roles.migrator, migratorPassword);
    // The user created the API role beforehand and set its password.
    await rowsOf(
      migratorUrl,
      `CREATE ROLE "${roles.api}" LOGIN PASSWORD '${EXISTING_API_PASSWORD}'`,
    );

    beforeRun = { rows: await ownershipAndPublicRights() };
    await run();
    await migrateCore(migratorUrl);
    await migrateContent(migratorUrl);
    await run();

    apiUrl = urlAs(serverUrl, database, roles.api, EXISTING_API_PASSWORD);
    backupUrl = await loginUrlOf(serverUrl, database, roles.backup);
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await postgres?.stop();
    await dropRoles(serverUrl, [
      roles.api,
      roles.backup,
      roles.migrator,
      ...dataApiRoles,
    ]);
  });

  it('leaves the database owner and the PUBLIC rights as they were', async () => {
    expect(await ownershipAndPublicRights()).toEqual(beforeRun.rows);
  });

  it('does not touch the migrator role or grant pg_read_all_data', async () => {
    const [migrator] = await rowsOf<{ rolcreaterole: boolean }>(
      superuserUrl,
      `SELECT rolcreaterole FROM pg_roles WHERE rolname = $1`,
      [roles.migrator],
    );
    expect(migrator?.rolcreaterole).toBe(true);
    const members = await rowsOf(
      superuserUrl,
      `SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
       WHERE r.rolname = 'pg_read_all_data' AND m.member = $1::regrole`,
      [roles.backup],
    );
    expect(members).toEqual([]);
  });

  it('keeps the password of the API role that already existed', async () => {
    expect(await failureCodeOf(apiUrl, 'SELECT 1')).toBeNull();
  });

  it('lets the API role do DML in public and content', async () => {
    for (const statement of [
      `INSERT INTO public.app_settings ("key", "value") VALUES ('probe', '1')`,
      `DELETE FROM public.app_settings WHERE "key" = 'probe'`,
      `INSERT INTO content.profile ("document_id", "name") VALUES (gen_random_uuid(), 'probe')`,
      `DELETE FROM content.profile WHERE "name" = 'probe'`,
    ]) {
      expect(await failureCodeOf(apiUrl, statement)).toBeNull();
    }
  });

  it.each(DDL_REFUSED_FOR_API_ROLE)('refuses the API role: %s', async (ddl) => {
    expect(await failureCodeOf(apiUrl, ddl)).toBe(INSUFFICIENT_PRIVILEGE);
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
      `DELETE FROM content.profile`,
      `TRUNCATE public.app_settings`,
      'CREATE TABLE public.denied_probe (id int)',
    ]) {
      expect(await failureCodeOf(backupUrl, statement)).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    }
  });

  it('leaves the Data API roles without any right on app tables and sequences, also on new ones', async () => {
    await rowsOf(
      migratorUrl,
      `CREATE TABLE public.after_probe (id serial PRIMARY KEY, label text)`,
    );
    await rowsOf(
      migratorUrl,
      `CREATE TABLE content.after_probe (id serial PRIMARY KEY, label text)`,
    );
    const rights = await rowsOf(
      superuserUrl,
      `SELECT r.rolname, n.nspname, c.relname
       FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE r.rolname = ANY($1) AND n.nspname IN ('public', 'content')
         AND ((c.relkind IN ('r', 'p', 'v', 'm', 'f')
               AND has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
           OR (c.relkind = 'S' AND has_sequence_privilege(r.oid, c.oid, 'USAGE, SELECT, UPDATE')))`,
      [dataApiRoles],
    );
    expect(rights).toEqual([]);

    await rowsOf(
      apiUrl,
      `INSERT INTO content.after_probe (label) VALUES ('a')`,
    );
    expect(await rowsOf(backupUrl, 'SELECT 1 FROM public.after_probe')).toEqual(
      [],
    );
  });

  it('changes nothing when it runs again', async () => {
    const before = await grantSnapshotOf(superuserUrl, database);
    await run();
    expect(await grantSnapshotOf(superuserUrl, database)).toEqual(before);
  });

  it('stops without a valid hosting, data_api_roles or the migrator login', async () => {
    await expect(
      run({ extraVariables: { hosting: undefined } }),
    ).rejects.toThrow(/hosting must be/);
    await expect(run({ hosting: 'elsewhere' })).rejects.toThrow(
      /hosting must be/,
    );
    await expect(
      run({ extraVariables: { data_api_roles: undefined } }),
    ).rejects.toThrow(/data_api_roles is required/);
    await expect(
      run({ extraVariables: { data_api_roles: 'no_such_role_for_the_test' } }),
    ).rejects.toThrow(/does not exist/);
    for (const [variable, name] of [
      ['migrator_role', roles.migrator],
      ['api_role', roles.api],
      ['backup_role', roles.backup],
    ] as const) {
      await expect(
        run({
          extraVariables: { data_api_roles: `anon,${name}` },
        }),
      ).rejects.toThrow(
        new RegExp(`data_api_roles must not contain the value of ${variable}`),
      );
    }
    await expect(run({ connectAs: undefined })).rejects.toThrow(
      /must run as the migrator role/,
    );
  });

  it('fails its self-check when the backup role is a member of another role', async () => {
    await rowsOf(superuserUrl, `GRANT pg_signal_backend TO "${roles.backup}"`);
    await expect(run()).rejects.toThrow(
      new RegExp(
        `self-check failed.*${roles.backup} is a member of role pg_signal_backend`,
      ),
    );
    await rowsOf(
      superuserUrl,
      `REVOKE pg_signal_backend FROM "${roles.backup}"`,
    );
    await run();
  });

  it('fails its self-check when the API role may create in public, and does not revoke it', async () => {
    await rowsOf(
      superuserUrl,
      `GRANT CREATE ON SCHEMA public TO "${roles.api}"`,
    );
    await expect(run()).rejects.toThrow(
      new RegExp(
        `self-check failed.*${roles.api} can create objects in schema public`,
      ),
    );
    expect(
      await rowsOf(
        superuserUrl,
        `SELECT has_schema_privilege($1, 'public', 'CREATE') AS can_create`,
        [roles.api],
      ),
    ).toEqual([{ can_create: true }]);
    await rowsOf(
      superuserUrl,
      `REVOKE CREATE ON SCHEMA public FROM "${roles.api}"`,
    );
    await run();
  });
});
