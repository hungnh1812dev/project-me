import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client';
import { APP_LOGGER, type AppLogger } from '../logging/AppLogger.port';
import { PrismaService } from './prisma.service';
import type { TransactionRunner, UnitOfWork } from './TransactionRunner.port';

type AfterCommitCallback = () => void | Promise<void>;

const AFTER_COMMIT_LOG_CONTEXT = 'PrismaTransactionRunner';

type UnitState = 'open' | 'committed' | 'rolledBack';

class PrismaUnitOfWork implements UnitOfWork {
  private state: UnitState = 'open';
  private readonly afterCommitCallbacks: AfterCommitCallback[] = [];

  constructor(
    readonly tx: Prisma.TransactionClient,
    private readonly isOwnedByRunner: boolean,
  ) {}

  afterCommit(callback: AfterCommitCallback): void {
    if (!this.isOwnedByRunner) {
      throw new Error(
        'afterCommit is not available on a unit built from a borrowed Prisma tx',
      );
    }
    if (this.state !== 'open') {
      throw new Error(
        `afterCommit cannot be registered on a unit that is ${this.state}`,
      );
    }
    this.afterCommitCallbacks.push(callback);
  }

  get isOpen(): boolean {
    return this.state === 'open';
  }

  markSettled(outcome: 'committed' | 'rolledBack'): void {
    this.state = outcome;
  }

  takeAfterCommitCallbacks(): readonly AfterCommitCallback[] {
    return this.afterCommitCallbacks.splice(0);
  }
}

/** The Prisma client of an open unit. For core adapters (repositories) only. */
export function prismaTxOf(unit: UnitOfWork): Prisma.TransactionClient {
  if (!(unit instanceof PrismaUnitOfWork)) {
    throw new TypeError('The unit of work was not opened by the Prisma runner');
  }
  if (!unit.isOpen) {
    throw new Error('The unit of work is closed');
  }
  return unit.tx;
}

/**
 * Transitional: lets a caller that still holds a Prisma `tx` hand it to a
 * migrated module. `afterCommit` throws on it, so a cache drop is never
 * silently skipped: the caller registers it on its own transaction.
 * Removed in CR-cl-1.
 */
export function unitOfWorkFromPrismaTx(
  tx: Prisma.TransactionClient,
): UnitOfWork {
  return new PrismaUnitOfWork(tx, false);
}

/** `CORE_TRANSACTION_RUNNER`: `prisma.$transaction` with Prisma's default options. */
@Injectable()
export class PrismaTransactionRunner implements TransactionRunner {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  async run<T>(work: (unit: UnitOfWork) => Promise<T>): Promise<T> {
    let unit: PrismaUnitOfWork | undefined;
    let result: T;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        unit = new PrismaUnitOfWork(tx, true);
        return work(unit);
      });
    } catch (error) {
      unit?.markSettled('rolledBack');
      throw error;
    }
    unit?.markSettled('committed');
    await this.runAfterCommit(unit);
    return result;
  }

  private async runAfterCommit(unit: PrismaUnitOfWork | undefined) {
    for (const callback of unit?.takeAfterCommitCallbacks() ?? []) {
      try {
        await callback();
      } catch (error) {
        this.logger.error(
          `An after-commit callback failed: ${describeFailure(error)}`,
          AFTER_COMMIT_LOG_CONTEXT,
        );
      }
    }
  }
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
