import { type DatabaseConfig, poolOptionsOf } from './DatabaseConfig.rules';

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
