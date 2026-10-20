import { Module } from '@nestjs/common';

import { DATABASE_HEALTH } from './database-health';
import { PgDatabaseHealth } from './pg-database-health';

@Module({
  providers: [{ provide: DATABASE_HEALTH, useClass: PgDatabaseHealth }],
  exports: [DATABASE_HEALTH],
})
export class DatabaseModule {}
