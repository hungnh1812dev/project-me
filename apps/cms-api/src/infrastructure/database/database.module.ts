import { Module } from '@nestjs/common';

import { DATABASE_HEALTH } from './database-health';
import { PrismaDatabaseHealth } from './prisma-database-health';
import { PrismaService } from './prisma.service';

@Module({
  providers: [
    PrismaService,
    { provide: DATABASE_HEALTH, useClass: PrismaDatabaseHealth },
  ],
  exports: [PrismaService, DATABASE_HEALTH],
})
export class DatabaseModule {}
