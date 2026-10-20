import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { type DatabaseHealth } from './database-health';

const PING_SQL = 'SELECT 1';
/** One connection is enough for probes; T08 brings the real pool. */
const PING_POOL_SIZE = 1;

@Injectable()
export class PgDatabaseHealth implements DatabaseHealth, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: IAppConfig) {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: PING_POOL_SIZE,
    });
    // An idle client error must not crash the process; the next ping reports it.
    this.pool.on('error', () => undefined);
  }

  async ping(timeoutMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Database ping timed out')),
        timeoutMs,
      );
    });
    try {
      await Promise.race([this.pool.query(PING_SQL), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
