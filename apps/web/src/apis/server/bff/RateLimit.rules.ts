import { MS_PER_SECOND } from '../../../configs/Http.constants';

export interface RateLimitDecision {
  isAllowed: boolean;
  /** Whole seconds until the window ends; at least 1. */
  retryAfterSeconds: number;
}

interface FixedWindowRateLimiterOptions {
  limit: number;
  windowMs: number;
  maxKeys: number;
  nowMs?: () => number;
}

interface Window {
  startedAtMs: number;
  count: number;
}

/**
 * Counts requests per key in fixed windows. At most `maxKeys` keys are kept;
 * the key whose window started first is evicted, so a flood of new keys
 * cannot grow memory.
 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly nowMs: () => number;

  constructor(private readonly options: FixedWindowRateLimiterOptions) {
    this.nowMs = options.nowMs ?? Date.now;
  }

  consume(key: string): RateLimitDecision {
    const now = this.nowMs();
    let window = this.windows.get(key);
    if (window === undefined || now - window.startedAtMs >= this.options.windowMs) {
      // Delete first so a restarted window moves to the newest position.
      this.windows.delete(key);
      window = { startedAtMs: now, count: 0 };
      this.windows.set(key, window);
      this.evictOldest();
    }
    window.count += 1;
    const remainingMs = window.startedAtMs + this.options.windowMs - now;
    return {
      isAllowed: window.count <= this.options.limit,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / MS_PER_SECOND)),
    };
  }

  private evictOldest(): void {
    while (this.windows.size > this.options.maxKeys) {
      const oldestKey = this.windows.keys().next().value;
      if (oldestKey === undefined) return;
      this.windows.delete(oldestKey);
    }
  }
}
