import { MIGRATION_POOL_MAX_CONNECTIONS } from './ContentEnginePersistence.constants';
import { createMigrationDb } from './MigrationDb.adapter';

describe('createMigrationDb', () => {
  it('builds a handle that connects lazily and can be destroyed with the database down', async () => {
    const db = createMigrationDb('postgres://user:pw@127.0.0.1:1/none');
    await expect(db.destroy()).resolves.toBeUndefined();
  });

  it('keeps the pool to the single migration connection', () => {
    expect(MIGRATION_POOL_MAX_CONNECTIONS).toBe(1);
  });
});
