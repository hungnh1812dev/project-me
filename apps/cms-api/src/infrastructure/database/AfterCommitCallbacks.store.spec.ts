import type { AppLogger } from '../logging/AppLogger.port';
import {
  AfterCommitCallbacks,
  MUST_BE_SYNCHRONOUS_MESSAGE,
} from './AfterCommitCallbacks.store';

function fakeLogger(): { logger: AppLogger; error: jest.Mock } {
  const error = jest.fn();
  return { logger: { warn: jest.fn(), error }, error };
}

/** A misuse the types forbid; the store still has to survive it at run time. */
function promiseCallback(make: () => Promise<unknown>): () => void {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  return make;
}

describe('AfterCommitCallbacks', () => {
  it('runs callbacks in registration order, once', () => {
    const store = new AfterCommitCallbacks();
    const order: number[] = [];
    store.register(() => order.push(1));
    store.register(() => order.push(2));
    store.markCommitted();
    store.runAll(fakeLogger().logger);
    store.runAll(fakeLogger().logger);
    expect(order).toEqual([1, 2]);
  });

  it.each(['markCommitted', 'markRolledBack'] as const)(
    'refuses to register after %s',
    (mark) => {
      const store = new AfterCommitCallbacks();
      store[mark]();
      expect(store.isOpen).toBe(false);
      expect(() => store.register(() => undefined)).toThrow(
        /cannot be registered/,
      );
    },
  );

  it('logs a throwing callback and still runs the next one', () => {
    const store = new AfterCommitCallbacks();
    const { logger, error } = fakeLogger();
    const next = jest.fn();
    store.register(() => {
      throw new Error('drop failed');
    });
    store.register(next);
    store.markCommitted();
    store.runAll(logger);
    expect(next).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'An after-commit callback failed: drop failed',
      expect.any(String),
    );
  });

  it('does not wait for a callback that returns a never-settling promise', () => {
    const store = new AfterCommitCallbacks();
    const { logger, error } = fakeLogger();
    const next = jest.fn();
    store.register(promiseCallback(() => new Promise(() => undefined)));
    store.register(next);
    store.markCommitted();
    store.runAll(logger);
    expect(next).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      MUST_BE_SYNCHRONOUS_MESSAGE,
      expect.any(String),
    );
  });

  it('logs a rejecting promise by message only, with no unhandled rejection', async () => {
    const store = new AfterCommitCallbacks();
    const { logger, error } = fakeLogger();
    store.register(
      promiseCallback(() => Promise.reject(new Error('late failure'))),
    );
    store.markCommitted();
    store.runAll(logger);
    await new Promise((resolve) => setImmediate(resolve));
    expect(error).toHaveBeenCalledWith(
      'An after-commit callback rejected: late failure',
      expect.any(String),
    );
  });
});
