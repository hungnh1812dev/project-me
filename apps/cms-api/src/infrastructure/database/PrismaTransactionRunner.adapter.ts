import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client';
import { APP_LOGGER, type AppLogger } from '../logging/AppLogger.port';
import {
  type AfterCommitCallback,
  AfterCommitCallbacks,
} from './AfterCommitCallbacks.store';
import { PrismaClient } from './prisma-client';
import { PrismaService } from './prisma.service';
import type { TransactionRunner, UnitOfWork } from './TransactionRunner.port';

class PrismaUnitOfWork implements UnitOfWork {
  readonly callbacks = new AfterCommitCallbacks();

  constructor(readonly tx: Prisma.TransactionClient) {}

  afterCommit(callback: AfterCommitCallback): void {
    this.callbacks.register(callback);
  }
}

/** The Prisma client of an open unit. For core adapters (repositories) only. */
export function prismaTxOf(unit: UnitOfWork): Prisma.TransactionClient {
  if (!(unit instanceof PrismaUnitOfWork)) {
    throw new TypeError('The unit of work was not opened by the Prisma runner');
  }
  if (!unit.callbacks.isOpen) {
    throw new Error('The unit of work is closed');
  }
  return unit.tx;
}

/** `CORE_TRANSACTION_RUNNER`: `prisma.$transaction` with Prisma's default options. */
@Injectable()
export class PrismaTransactionRunner implements TransactionRunner {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaClient,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  async run<T>(work: (unit: UnitOfWork) => Promise<T>): Promise<T> {
    let unit: PrismaUnitOfWork | undefined;
    let result: T;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        unit = new PrismaUnitOfWork(tx);
        return work(unit);
      });
    } catch (error) {
      unit?.callbacks.markRolledBack();
      throw error;
    }
    unit?.callbacks.markCommitted();
    unit?.callbacks.runAll(this.logger);
    return result;
  }
}
