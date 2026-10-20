import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../clock';
import { RATE_LIMIT_SWEEP_INTERVAL_MS } from '../constants/limits.constants';

/** Counter state after one hit. */
export interface RateLimitHit {
  /** Hits in the current window, this one included. */
  readonly count: number;
  /** Epoch ms when the window ends and the counter starts over. */
  readonly resetAt: number;
}

/**
 * Fixed-window hit counters. Async so a shared store (Postgres, Redis) can
 * replace the in-memory one without touching callers.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * In-memory store: correct for ONE API replica only (v1). Every replica would
 * count separately, so running more than one requires a shared store
 * (Postgres or Redis) behind `RATE_LIMIT_STORE`. Counters are lost on restart.
 *
 * Memory stays bounded: expired counters are swept at most once per
 * `RATE_LIMIT_SWEEP_INTERVAL_MS`, so the map holds only keys seen within the
 * longest window.
 */
@Injectable()
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, Counter>();
  private nextSweepAt: number;

  constructor(@Inject(Clock) private readonly clock: Clock) {
    this.nextSweepAt = clock.now() + RATE_LIMIT_SWEEP_INTERVAL_MS;
  }

  /** Number of live counters (for tests and diagnostics). */
  get size(): number {
    return this.counters.size;
  }

  hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = this.clock.now();
    this.sweep(now);

    let counter = this.counters.get(key);
    if (counter === undefined || counter.resetAt <= now) {
      counter = { count: 0, resetAt: now + windowMs };
      this.counters.set(key, counter);
    }
    counter.count += 1;
    return Promise.resolve({ count: counter.count, resetAt: counter.resetAt });
  }

  private sweep(now: number): void {
    if (now < this.nextSweepAt) return;
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) this.counters.delete(key);
    }
    this.nextSweepAt = now + RATE_LIMIT_SWEEP_INTERVAL_MS;
  }
}
