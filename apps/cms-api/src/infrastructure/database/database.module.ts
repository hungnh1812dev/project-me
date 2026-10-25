import { Module } from '@nestjs/common';

import { DATABASE_HEALTH } from './database-health';
import { PrismaDatabaseHealth } from './prisma-database-health';
import { PrismaTransactionRunner } from './PrismaTransactionRunner.adapter';
import { PrismaService } from './prisma.service';
import { CORE_TRANSACTION_RUNNER } from './TransactionRunner.port';

@Module({
  providers: [
    PrismaService,
    { provide: DATABASE_HEALTH, useClass: PrismaDatabaseHealth },
    { provide: CORE_TRANSACTION_RUNNER, useClass: PrismaTransactionRunner },
  ],
  exports: [PrismaService, DATABASE_HEALTH, CORE_TRANSACTION_RUNNER],
})
export class DatabaseModule {}
