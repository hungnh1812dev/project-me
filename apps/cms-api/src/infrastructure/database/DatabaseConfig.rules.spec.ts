import {
  type DatabaseConfig,
  type DatabaseRoleFacts,
  ddlRiskNamesOf,
  ddlRiskWarningOf,
  poolOptionsOf,
} from './DatabaseConfig.rules';

describe('poolOptionsOf', () => {
  it('passes the fields as they are, with no URL encoding', () => {
    const config: DatabaseConfig = {
      host: 'db.local',
      port: 5433,
      database: 'app',
      user: 'svc',
      password: 'p@ss:w/rd?#%',
    };
    expect(poolOptionsOf(config)).toEqual(config);
  });

  it('keeps a ready connection string for tests and tooling', () => {
    expect(poolOptionsOf('postgresql://u:p@h:1/d')).toEqual({
      connectionString: 'postgresql://u:p@h:1/d',
    });
  });

  const config: DatabaseConfig = {
    host: 'db.local',
    port: 5432,
    database: 'app',
    user: 'svc',
    password: 'pw',
  };

  it('sets no ssl option when tls is absent', () => {
    expect(poolOptionsOf(config)).not.toHaveProperty('ssl');
  });

  it('encrypts without verification for require', () => {
    expect(poolOptionsOf({ ...config, tls: { mode: 'require' } }).ssl).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('verifies chain and host for verify-full', () => {
    const tls = { mode: 'verify-full', rootCertificatePem: 'PEM' } as const;
    expect(poolOptionsOf({ ...config, tls }).ssl).toEqual({
      ca: 'PEM',
      rejectUnauthorized: true,
    });
  });
});

describe('ddlRiskNamesOf', () => {
  const dmlOnly: DatabaseRoleFacts = {
    isSuperuser: false,
    canCreateInDatabase: false,
    schemasWithCreate: [],
    schemasWithOwnedObjects: [],
    memberOfRoles: [],
  };

  it('finds nothing for a DML-only role', () => {
    expect(ddlRiskNamesOf(dmlOnly)).toEqual([]);
  });

  it.each([
    [{ isSuperuser: true }, ['superuser']],
    [{ canCreateInDatabase: true }, ['CREATE on the database']],
    [{ schemasWithCreate: ['public'] }, ['CREATE on schema public']],
    [
      { schemasWithCreate: ['public', 'content'] },
      ['CREATE on schema public', 'CREATE on schema content'],
    ],
    [
      { schemasWithOwnedObjects: ['content'] },
      ['owns objects in schema content'],
    ],
    [
      { memberOfRoles: ['pg_execute_server_program', 'abyss_migrator'] },
      [
        'member of role pg_execute_server_program',
        'member of role abyss_migrator',
      ],
    ],
  ] as [Partial<DatabaseRoleFacts>, string[]][])(
    'names the problem for %j',
    (change, expected) => {
      expect(ddlRiskNamesOf({ ...dmlOnly, ...change })).toEqual(expected);
    },
  );

  it('keeps every problem when several apply', () => {
    const names = ddlRiskNamesOf({
      isSuperuser: true,
      canCreateInDatabase: true,
      schemasWithCreate: ['public'],
      schemasWithOwnedObjects: ['public'],
      memberOfRoles: ['pg_signal_backend'],
    });
    expect(names).toHaveLength(5);
  });
});

describe('ddlRiskWarningOf', () => {
  it('lists the problems and points to the ADR', () => {
    const message = ddlRiskWarningOf(['superuser', 'CREATE on schema public']);
    expect(message).toContain('superuser; CREATE on schema public');
    expect(message).toContain('docs/adr/0012-database-role-separation.md');
  });
});
