import { Logger } from '@nestjs/common';

import { Clock } from '../time/clock';
import {
  RATE_LIMIT_CAPACITY_WARN_INTERVAL_MS,
  RATE_LIMIT_MAX_KEYS,
  RATE_LIMIT_SWEEP_INTERVAL_MS,
} from '../constants/limits.constants';
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
    store = new InMemoryRateLimitStore(clock, RATE_LIMIT_MAX_KEYS);
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

  describe('max-keys cap (T10a)', () => {
    const CAP = 3;
    let warn: jest.SpiedFunction<Logger['warn']>;

    beforeEach(() => {
      store = new InMemoryRateLimitStore(clock, CAP);
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warn.mockRestore();
    });

    async function fill(windowMs = WINDOW_MS): Promise<void> {
      for (let i = 0; i < CAP; i += 1) await store.hit(`k${i}`, windowMs);
    }

    it('refuses a new key at the cap while existing keys keep counting', async () => {
      await fill();
      clock.time = START + 1_000;

      expect(await store.hit('new', WINDOW_MS)).toEqual({
        count: 0,
        resetAt: START + WINDOW_MS,
        refused: true,
      });
      expect(store.size).toBe(CAP);
      expect(await store.hit('k0', WINDOW_MS)).toEqual({
        count: 2,
        resetAt: START + WINDOW_MS,
      });
    });

    it('lets an existing expired key start a new window at the cap', async () => {
      await fill();
      clock.time = START + WINDOW_MS;
      expect(await store.hit('k1', WINDOW_MS)).toEqual({
        count: 1,
        resetAt: START + 2 * WINDOW_MS,
      });
    });

    it('sweeps expired counters to make room before refusing', async () => {
      await store.hit('short', WINDOW_MS);
      await store.hit('long-a', WINDOW_MS * 2);
      await store.hit('long-b', WINDOW_MS * 2);
      expect((await store.hit('new', WINDOW_MS)).refused).toBe(true);

      // Before the periodic sweep is due, only "short" has expired.
      clock.time = START + WINDOW_MS;
      expect(await store.hit('new', WINDOW_MS)).toEqual({
        count: 1,
        resetAt: START + 2 * WINDOW_MS,
      });
      expect(store.size).toBe(CAP);
      expect((await store.hit('long-a', WINDOW_MS)).count).toBe(2);
      expect((await store.hit('other', WINDOW_MS)).refused).toBe(true);
    });

    it('gives the earliest expiry as resetAt of a refused hit', async () => {
      await store.hit('a', WINDOW_MS * 3);
      await store.hit('b', WINDOW_MS);
      await store.hit('c', WINDOW_MS * 2);
      clock.time = START + 1_000;
      expect((await store.hit('new', WINDOW_MS)).resetAt).toBe(
        START + WINDOW_MS,
      );
    });

    it('logs one warning per interval, with the refused count and no keys', async () => {
      await fill(RATE_LIMIT_CAPACITY_WARN_INTERVAL_MS * 2);
      const secretKey = 'login:ip:203.0.113.7';
      await store.hit(secretKey, WINDOW_MS);
      await store.hit(secretKey, WINDOW_MS);
      await store.hit('another', WINDOW_MS);
      expect(warn).toHaveBeenCalledTimes(1);

      clock.time = START + RATE_LIMIT_CAPACITY_WARN_INTERVAL_MS - 1;
      await store.hit(secretKey, WINDOW_MS);
      expect(warn).toHaveBeenCalledTimes(1);

      clock.time = START + RATE_LIMIT_CAPACITY_WARN_INTERVAL_MS + 1;
      await store.hit(secretKey, WINDOW_MS);
      expect(warn).toHaveBeenCalledTimes(2);
      const second = String(warn.mock.calls[1]?.[0]);
      expect(second).toContain(`(${CAP} keys)`);
      expect(second).toContain('refused 4 new key(s)');
      for (const [message] of warn.mock.calls) {
        expect(String(message)).not.toContain('203.0.113.7');
      }
    });
  });
});
