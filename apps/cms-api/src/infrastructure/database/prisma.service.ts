import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { createPgAdapter, PrismaClient } from './prisma-client';

/** The app's Prisma client (schema `public`). Connects lazily on first query. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: IAppConfig) {
    const { adapter, pool } = createPgAdapter(config.database);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
