import { Inject, Injectable } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';

import {
  type AfterCommitCallback,
  AfterCommitCallbacks,
} from '../../../infrastructure/database/AfterCommitCallbacks.store';
import type {
  ContentTransactionRunner,
  UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import {
  APP_LOGGER,
  type AppLogger,
} from '../../../infrastructure/logging/AppLogger.port';
import {
  CONTENT_STEP_SAVEPOINT,
  ContentDbProvider,
} from './ContentDatabase.adapter';
import type { ContentDatabase } from './TreeLoader.adapter';

class ContentUnitOfWork implements UnitOfWork {
  readonly callbacks = new AfterCommitCallbacks();

  constructor(readonly trx: Transaction<ContentDatabase>) {}

  afterCommit(callback: AfterCommitCallback): void {
    this.callbacks.register(callback);
  }
}

/** The Kysely transaction of an open unit. For content adapters (repositories) only. */
export function contentTrxOf(unit: UnitOfWork): Transaction<ContentDatabase> {
  if (!(unit instanceof ContentUnitOfWork)) {
    throw new TypeError(
      'The unit of work was not opened by the content runner',
    );
  }
  if (!unit.callbacks.isOpen) {
    throw new Error('The unit of work is closed');
  }
  return unit.trx;
}

/** `CONTENT_TRANSACTION_RUNNER`: one Kysely transaction on the content pool. */
@Injectable()
export class KyselyContentTransactionRunner implements ContentTransactionRunner {
  constructor(
    private readonly content: ContentDbProvider,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  async run<T>(work: (unit: UnitOfWork) => Promise<T>): Promise<T> {
    let unit: ContentUnitOfWork | undefined;
    let result: T;
    try {
      result = await this.content.db.transaction().execute((trx) => {
        unit = new ContentUnitOfWork(trx);
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

  /**
   * Callbacks registered by `work` go on the outer unit's list and run only
   * after the outer commit, also when this step rolled back: a cache drop
   * that was not needed only forces a re-read.
   */
  async runInSavepoint<T>(
    unit: UnitOfWork,
    work: (unit: UnitOfWork) => Promise<T>,
  ): Promise<T> {
    const trx = contentTrxOf(unit);
    await sql`savepoint ${sql.id(CONTENT_STEP_SAVEPOINT)}`.execute(trx);
    try {
      const result = await work(unit);
      await sql`release savepoint ${sql.id(CONTENT_STEP_SAVEPOINT)}`.execute(
        trx,
      );
      return result;
    } catch (error) {
      await sql`rollback to savepoint ${sql.id(CONTENT_STEP_SAVEPOINT)}`.execute(
        trx,
      );
      throw error;
    }
  }
}
