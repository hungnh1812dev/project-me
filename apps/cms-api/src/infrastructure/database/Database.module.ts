import { Module } from '@nestjs/common';

import { PrismaTransactionRunner } from './PrismaTransactionRunner.adapter';
import { PrismaService } from './Prisma.service';
import { CORE_TRANSACTION_RUNNER } from './TransactionRunner.port';

@Module({
  providers: [
    PrismaService,
    { provide: CORE_TRANSACTION_RUNNER, useClass: PrismaTransactionRunner },
  ],
  exports: [PrismaService, CORE_TRANSACTION_RUNNER],
})
export class DatabaseModule {}
