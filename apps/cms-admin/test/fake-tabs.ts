import type {
  RefreshChannel,
  RefreshLocks,
} from '../src/features/auth/cross-tab-refresh';

/** Fakes for simulating several admin tabs in one test (T11a). */

/** One Web Lock shared by all fake tabs: callbacks run one at a time. */
export function fakeLocks(): RefreshLocks {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
      const run = tail.then(callback, callback);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

/** A broadcast bus: a message reaches every other tab's channel. */
export function fakeBus(delivery: 'sync' | 'never' = 'sync') {
  const listeners = new Set<(event: { data: unknown }) => void>();
  return {
    channel(): RefreshChannel {
      let own: ((event: { data: unknown }) => void) | undefined;
      return {
        addEventListener: (_type, listener) => {
          own = listener;
          listeners.add(listener);
        },
        postMessage: (data) => {
          if (delivery === 'never') return;
          for (const listener of listeners) {
            if (listener !== own) listener({ data });
          }
        },
      };
    },
  };
}
