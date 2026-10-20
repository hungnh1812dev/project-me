import { Inject, Injectable, Logger } from '@nestjs/common';

import { Clock } from '../clock';
import {
  RATE_LIMIT_CAPACITY_WARN_INTERVAL_MS,
  RATE_LIMIT_SWEEP_INTERVAL_MS,
} from '../constants/limits.constants';

/** Counter state after one hit. */
export interface RateLimitHit {
  /** Hits in the current window, this one included. */
  readonly count: number;
  /** Epoch ms when the window ends and the counter starts over. */
  readonly resetAt: number;
  /**
   * True when the store could not start a counter for a new key (it is at
   * capacity). The hit was not counted; callers must treat it as over the
   * limit, with `resetAt` as the earliest time to retry.
   */
  readonly refused?: boolean;
}

/**
 * Fixed-window hit counters. Async so a shared store (Postgres, Redis) can
 * replace the in-memory one without touching callers.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

/** Maximum live keys of `InMemoryRateLimitStore` (`RATE_LIMIT_MAX_KEYS`). */
export const RATE_LIMIT_STORE_MAX_KEYS = Symbol('RATE_LIMIT_STORE_MAX_KEYS');

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * In-memory store: correct for ONE API replica only (v1). Every replica would
 * count separately, so running more than one requires a shared store
 * (Postgres or Redis) behind `RATE_LIMIT_STORE`. Counters are lost on restart.
 *
 * Memory stays bounded twice over: expired counters are swept at most once
 * per `RATE_LIMIT_SWEEP_INTERVAL_MS`, and the map never holds more than
 * `maxKeys` counters (T10a). When a new key arrives at the cap, expired
 * counters are swept first; if the map is still full the key is refused
 * (fail closed) and a throttled warning is logged. Live counters are never
 * evicted, since that would let an attacker reset someone's limit.
 */
@Injectable()
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly logger = new Logger(InMemoryRateLimitStore.name);
  private readonly counters = new Map<string, Counter>();
  private nextSweepAt: number;
  /** Lower bound of every live counter's `resetAt`: nothing frees up before. */
  private earliestResetAt = Number.POSITIVE_INFINITY;
  private nextWarnAt = Number.NEGATIVE_INFINITY;
  private refusedSinceWarn = 0;

  constructor(
    @Inject(Clock) private readonly clock: Clock,
    @Inject(RATE_LIMIT_STORE_MAX_KEYS) private readonly maxKeys: number,
  ) {
    this.nextSweepAt = clock.now() + RATE_LIMIT_SWEEP_INTERVAL_MS;
  }

  /** Number of live counters (for tests and diagnostics). */
  get size(): number {
    return this.counters.size;
  }

  hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = this.clock.now();
    if (now >= this.nextSweepAt) this.sweep(now);

    let counter = this.counters.get(key);
    if (counter === undefined && !this.hasRoom(now)) {
      this.warnRefused(now);
      return Promise.resolve({
        count: 0,
        resetAt: this.earliestResetAt,
        refused: true,
      });
    }
    if (counter === undefined || counter.resetAt <= now) {
      counter = { count: 0, resetAt: now + windowMs };
      this.counters.set(key, counter);
      this.earliestResetAt = Math.min(this.earliestResetAt, counter.resetAt);
    }
    counter.count += 1;
    return Promise.resolve({ count: counter.count, resetAt: counter.resetAt });
  }

  /**
   * Room for one more key. At the cap, sweep, but only once some counter can
   * have expired, so a flood of refused keys never rescans the map each time.
   */
  private hasRoom(now: number): boolean {
    if (this.counters.size < this.maxKeys) return true;
    if (now >= this.earliestResetAt) this.sweep(now);
    return this.counters.size < this.maxKeys;
  }

  private sweep(now: number): void {
    let earliest = Number.POSITIVE_INFINITY;
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) this.counters.delete(key);
      else earliest = Math.min(earliest, counter.resetAt);
    }
    this.earliestResetAt = earliest;
    this.nextSweepAt = now + RATE_LIMIT_SWEEP_INTERVAL_MS;
  }

  /** One warning per interval with the count; no keys (IPs, email hashes). */
  private warnRefused(now: number): void {
    this.refusedSinceWarn += 1;
    if (now < this.nextWarnAt) return;
    this.logger.warn(
      `Rate-limit store full (${this.maxKeys} keys): refused ${this.refusedSinceWarn} new key(s) since the last warning; new clients get 429 until counters expire`,
    );
    this.refusedSinceWarn = 0;
    this.nextWarnAt = now + RATE_LIMIT_CAPACITY_WARN_INTERVAL_MS;
  }
}
