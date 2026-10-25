/** DI token of the core (Prisma) transaction runner. */
export const CORE_TRANSACTION_RUNNER = Symbol('CORE_TRANSACTION_RUNNER');

/** DI token of the content (Kysely) transaction runner. */
export const CONTENT_TRANSACTION_RUNNER = Symbol('CONTENT_TRANSACTION_RUNNER');

/**
 * One open transaction. Opaque to use cases: only the adapter that created
 * it can read the database handle out of it.
 */
export interface UnitOfWork {
  /**
   * Runs `callback` once, after the transaction commits, in registration
   * order. It never runs on rollback. A callback that throws is logged and
   * does not undo the commit or stop the later callbacks.
   */
  afterCommit(callback: () => void | Promise<void>): void;
}

/** Runs `work` in one transaction: it commits when `work` resolves and rolls back when it throws. */
export interface TransactionRunner {
  run<T>(work: (unit: UnitOfWork) => Promise<T>): Promise<T>;
}

/** The content database runner, which can also scope a nested step to a savepoint. */
export interface ContentTransactionRunner extends TransactionRunner {
  /** Runs `work` in a savepoint of `unit`: a throw rolls back only this step and is rethrown. */
  runInSavepoint<T>(
    unit: UnitOfWork,
    work: (unit: UnitOfWork) => Promise<T>,
  ): Promise<T>;
}
