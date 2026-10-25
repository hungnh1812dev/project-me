import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { type ClientConfig, Pool, types } from 'pg';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import {
  type DatabaseConnection,
  poolOptionsOf,
} from '../../infrastructure/database/database-config';
import { CONTENT_POOL_MAX_CONNECTIONS } from './adapters/ContentEnginePersistence.constants';
import type { ContentDatabase } from './tree-loader';

const keepText = (value: string): string => value;

/**
 * `date` columns come back as the text Postgres sends (`2026-03-01`), not a
 * JS Date: a Date is midnight in the server's time zone and would shift the
 * calendar day when serialized to UTC (decided for date columns). Every other type
 * keeps pg's default parser.
 */
const DATE_OID: number = types.builtins.DATE;

type PgTypes = NonNullable<ClientConfig['types']>;

/**
 * Pool-level parsers: only this pool is affected, never pg's global ones.
 * (`pg` passes `(oid, format)` through; only `date` is replaced.)
 */
export const CONTENT_TYPE_PARSERS: PgTypes = {
  getTypeParser: ((
    oid: number,
    format?: 'text' | 'binary',
  ): ((value: string) => unknown) =>
    oid === DATE_OID
      ? keepText
      : (types.getTypeParser(oid, format) as (
          value: string,
        ) => unknown)) as PgTypes['getTypeParser'],
};

export function createContentDb(
  connection: DatabaseConnection,
): Kysely<ContentDatabase> {
  const pool = new Pool({
    ...poolOptionsOf(connection),
    max: CONTENT_POOL_MAX_CONNECTIONS,
    types: CONTENT_TYPE_PARSERS,
  });
  // An idle-client error must not crash the process (the next query reports it).
  pool.on('error', () => undefined);
  return new Kysely<ContentDatabase>({
    dialect: new PostgresDialect({ pool }),
  });
}

/**
 * The app's connection to the generated content tables (Kysely, no Prisma).
 * Connects lazily on first query, so the API boots with the database down.
 */
@Injectable()
export class ContentDbProvider implements OnModuleDestroy {
  readonly db: Kysely<ContentDatabase>;

  constructor(@Inject(APP_CONFIG) config: IAppConfig) {
    this.db = createContentDb(config.database);
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
