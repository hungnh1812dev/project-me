import { FixedWindowRateLimiter } from './RateLimit.rules';

function limiterWith(options: { limit?: number; maxKeys?: number } = {}) {
  const clock = { nowMs: 1_000_000 };
  const limiter = new FixedWindowRateLimiter({
    limit: options.limit ?? 2,
    windowMs: 60_000,
    maxKeys: options.maxKeys ?? 100,
    nowMs: () => clock.nowMs,
  });
  return { limiter, clock };
}

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit, then refuses with the seconds left in the window', () => {
    const { limiter, clock } = limiterWith();
    expect(limiter.consume('a').isAllowed).toBe(true);
    expect(limiter.consume('a').isAllowed).toBe(true);
    clock.nowMs += 10_500;
    expect(limiter.consume('a')).toEqual({ isAllowed: false, retryAfterSeconds: 50 });
  });

  it('counts each key on its own', () => {
    const { limiter } = limiterWith({ limit: 1 });
    expect(limiter.consume('a').isAllowed).toBe(true);
    expect(limiter.consume('b').isAllowed).toBe(true);
    expect(limiter.consume('a').isAllowed).toBe(false);
  });

  it('starts a new window when the old one ended', () => {
    const { limiter, clock } = limiterWith({ limit: 1 });
    limiter.consume('a');
    expect(limiter.consume('a').isAllowed).toBe(false);
    clock.nowMs += 60_000;
    expect(limiter.consume('a').isAllowed).toBe(true);
  });

  it('evicts the oldest key when more than maxKeys are kept', () => {
    const { limiter } = limiterWith({ limit: 1, maxKeys: 2 });
    limiter.consume('a');
    limiter.consume('b');
    limiter.consume('c');
    // 'a' was forgotten, so it starts fresh; 'c' is still counted.
    expect(limiter.consume('a').isAllowed).toBe(true);
    expect(limiter.consume('c').isAllowed).toBe(false);
  });
});
