import { types } from 'pg';

import {
  CONTENT_TYPE_PARSERS,
  createMigrationDb,
  MIGRATION_POOL_MAX_CONNECTIONS,
} from './ContentDatabase.adapter';

const DATE_OID = 1082;
const TIMESTAMPTZ_OID = 1184;
const INT4_OID = 23;

type Parse = (value: string) => unknown;

const contentParser = (oid: number): Parse =>
  CONTENT_TYPE_PARSERS.getTypeParser(oid) as Parse;
const defaultParser = (oid: number): Parse => types.getTypeParser(oid) as Parse;

describe('content pool type parsers', () => {
  it('keeps a date as the text Postgres sends', () => {
    expect(contentParser(DATE_OID)('2026-03-01')).toBe('2026-03-01');
  });

  it('leaves every other type on the pg defaults', () => {
    const stamp = '2026-03-01 10:00:00+00';
    expect(contentParser(TIMESTAMPTZ_OID)(stamp)).toEqual(
      defaultParser(TIMESTAMPTZ_OID)(stamp),
    );
    expect(contentParser(INT4_OID)('42')).toBe(42);
  });

  it('does not change the global date parser', () => {
    expect(defaultParser(DATE_OID)('2026-03-01')).toBeInstanceOf(Date);
  });
});

describe('createMigrationDb', () => {
  it('builds a handle that connects lazily and can be destroyed with the database down', async () => {
    const db = createMigrationDb('postgres://user:pw@127.0.0.1:1/none');
    await expect(db.destroy()).resolves.toBeUndefined();
  });

  it('keeps the pool to the single migration connection', () => {
    expect(MIGRATION_POOL_MAX_CONNECTIONS).toBe(1);
  });
});
