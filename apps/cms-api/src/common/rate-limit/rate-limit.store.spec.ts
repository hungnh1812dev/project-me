import { Clock } from '../clock';
import { RATE_LIMIT_SWEEP_INTERVAL_MS } from '../constants/limits.constants';
import { InMemoryRateLimitStore } from './rate-limit.store';

const WINDOW_MS = 60_000;
const START = 1_700_000_000_000;

class FakeClock extends Clock {
  time = START;
  override now(): number {
    return this.time;
  }
}

describe('InMemoryRateLimitStore', () => {
  let clock: FakeClock;
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    clock = new FakeClock();
    store = new InMemoryRateLimitStore(clock);
  });

  it('counts hits per key within one window', async () => {
    expect(await store.hit('a', WINDOW_MS)).toEqual({
      count: 1,
      resetAt: START + WINDOW_MS,
    });
    expect((await store.hit('a', WINDOW_MS)).count).toBe(2);
    expect((await store.hit('b', WINDOW_MS)).count).toBe(1);
  });

  it('keeps the window fixed and starts over when it ends', async () => {
    await store.hit('a', WINDOW_MS);
    clock.time = START + WINDOW_MS - 1;
    expect(await store.hit('a', WINDOW_MS)).toEqual({
      count: 2,
      resetAt: START + WINDOW_MS,
    });
    clock.time = START + WINDOW_MS;
    expect(await store.hit('a', WINDOW_MS)).toEqual({
      count: 1,
      resetAt: START + 2 * WINDOW_MS,
    });
  });

  it('evicts expired counters on the next sweep', async () => {
    await store.hit('old', WINDOW_MS);
    await store.hit('long', RATE_LIMIT_SWEEP_INTERVAL_MS * 2);
    expect(store.size).toBe(2);

    clock.time = START + RATE_LIMIT_SWEEP_INTERVAL_MS;
    await store.hit('new', WINDOW_MS);
    expect(store.size).toBe(2);
    expect((await store.hit('long', WINDOW_MS)).count).toBe(2);
  });
});
