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
});
