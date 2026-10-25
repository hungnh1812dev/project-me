import type { AppLogger } from '../logging/AppLogger.port';

export type AfterCommitCallback = () => void;

type UnitState = 'open' | 'committed' | 'rolledBack';

const LOG_CONTEXT = 'AfterCommitCallbacks';

/**
 * The callbacks of one unit of work and the unit's state. Both runners
 * (Prisma, content) use it, so the rules live here once: register only while
 * open, run once after the commit in registration order, never after a rollback.
 */
export class AfterCommitCallbacks {
  private state: UnitState = 'open';
  private readonly callbacks: AfterCommitCallback[] = [];

  get isOpen(): boolean {
    return this.state === 'open';
  }

  register(callback: AfterCommitCallback): void {
    if (!this.isOpen) {
      throw new Error(
        `afterCommit cannot be registered on a unit that is ${this.state}`,
      );
    }
    this.callbacks.push(callback);
  }

  markCommitted(): void {
    this.state = 'committed';
  }

  markRolledBack(): void {
    this.state = 'rolledBack';
  }

  /**
   * Calls every callback in order without awaiting. A throwing callback is
   * logged and the next one still runs. A callback that returns a promise is
   * logged as a misuse, its rejection is logged too, and it is not waited for.
   */
  runAll(logger: AppLogger): void {
    for (const callback of this.callbacks.splice(0)) {
      try {
        const returned: unknown = callback();
        if (isThenable(returned)) {
          logger.error(MUST_BE_SYNCHRONOUS_MESSAGE, LOG_CONTEXT);
          returned.then(undefined, (reason: unknown) =>
            logger.error(
              `An after-commit callback rejected: ${describeFailure(reason)}`,
              LOG_CONTEXT,
            ),
          );
        }
      } catch (error) {
        logger.error(
          `An after-commit callback failed: ${describeFailure(error)}`,
          LOG_CONTEXT,
        );
      }
    }
  }
}

export const MUST_BE_SYNCHRONOUS_MESSAGE =
  'An after-commit callback returned a promise; after-commit callbacks must be synchronous';

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
