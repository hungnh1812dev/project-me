import { deferred } from '../../test/fake-api';
import { fakeBus, fakeLocks } from '../../test/fake-tabs';
import { createCrossTabRefresh } from './cross-tab-refresh';

const LOCK = 'test:refresh';

/** The server: each call rotates the shared cookie and returns a new token. */
function fakeServer() {
  let count = 0;
  const gate = deferred<void>();
  const refresh = vi.fn<() => Promise<string>>(async () => {
    count += 1;
    const token = `access-${count}`;
    await gate.promise;
    return token;
  });
  return { refresh, open: () => gate.resolve() };
}

describe('createCrossTabRefresh', () => {
  it('sends one refresh for concurrent calls from three tabs', async () => {
    const locks = fakeLocks();
    const bus = fakeBus();
    const server = fakeServer();
    const tabs = [1, 2, 3].map(() =>
      createCrossTabRefresh(server.refresh, {
        locks,
        channel: bus.channel(),
        lockName: LOCK,
      }),
    );

    const results = Promise.all(tabs.map((refresh) => refresh()));
    server.open();
    expect(await results).toEqual(['access-1', 'access-1', 'access-1']);
    expect(server.refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes again later instead of reusing an old shared token', async () => {
    let clock = 1_000;
    const now = () => clock;
    const locks = fakeLocks();
    const bus = fakeBus();
    const server = fakeServer();
    server.open();
    const [a, b] = [1, 2].map(() =>
      createCrossTabRefresh(server.refresh, {
        locks,
        channel: bus.channel(),
        lockName: LOCK,
        now,
      }),
    );
    expect(await a?.()).toBe('access-1');
    clock += 1;
    expect(await b?.()).toBe('access-2');
    expect(server.refresh).toHaveBeenCalledTimes(2);
  });

  it('takes turns when the message never arrives (no overlap, so no reuse)', async () => {
    const locks = fakeLocks();
    const bus = fakeBus('never');
    let running = 0;
    let overlapped = false;
    let count = 0;
    const refresh = vi.fn<() => Promise<string>>(async () => {
      running += 1;
      overlapped ||= running > 1;
      await Promise.resolve();
      running -= 1;
      count += 1;
      return `access-${count}`;
    });
    const tabs = [1, 2].map(() =>
      createCrossTabRefresh(refresh, {
        locks,
        channel: bus.channel(),
        lockName: LOCK,
      }),
    );
    await Promise.all(tabs.map((tab) => tab()));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(overlapped).toBe(false);
  });

  it('falls back to a plain refresh without Web Locks', async () => {
    const refresh = vi.fn<() => Promise<string>>(() =>
      Promise.resolve('access'),
    );
    const run = createCrossTabRefresh(refresh, { lockName: LOCK });
    expect(run).toBe(refresh);
    expect(await run()).toBe('access');
  });

  it('lets the next tab try after a failed refresh', async () => {
    const locks = fakeLocks();
    const bus = fakeBus();
    const refresh = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('401'))
      .mockResolvedValueOnce('access');
    const [a, b] = [1, 2].map(() =>
      createCrossTabRefresh(refresh, {
        locks,
        channel: bus.channel(),
        lockName: LOCK,
      }),
    );
    const results = await Promise.allSettled([a?.(), b?.()]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
  });
});
