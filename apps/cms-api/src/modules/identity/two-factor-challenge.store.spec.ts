import { Clock } from '../../common/clock';
import {
  TWO_FACTOR_CHALLENGE_MAX_KEYS,
  TWO_FACTOR_TEMP_TOKEN_MAX_ATTEMPTS,
  TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS,
} from '../../common/constants/auth.constants';
import { MS_PER_SECOND } from '../../common/constants/limits.constants';
import { TwoFactorChallengeStore } from './two-factor-challenge.store';

const START = 1_700_000_000_000;
const TTL_MS = TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS * MS_PER_SECOND;

class FakeClock extends Clock {
  time = START;
  override now(): number {
    return this.time;
  }
}

describe('TwoFactorChallengeStore (SPEC §6: 5 attempts per temp token)', () => {
  let clock: FakeClock;
  let store: TwoFactorChallengeStore;

  beforeEach(() => {
    clock = new FakeClock();
    store = new TwoFactorChallengeStore(clock);
  });

  it('allows 5 attempts per token, then reports it exhausted', () => {
    for (let i = 0; i < TWO_FACTOR_TEMP_TOKEN_MAX_ATTEMPTS; i += 1) {
      expect(store.attempt('a', START + TTL_MS)).toBe('allowed');
    }
    expect(store.attempt('a', START + TTL_MS)).toBe('exhausted');
    expect(store.isLive('a')).toBe(false);
    // Other tokens are counted apart.
    expect(store.attempt('b', START + TTL_MS)).toBe('allowed');
  });

  it('is single use', () => {
    expect(store.isLive('a')).toBe(true);
    expect(store.attempt('a', START + TTL_MS)).toBe('allowed');
    expect(store.markUsed('a', START + TTL_MS)).toBe(true);
    expect(store.markUsed('a', START + TTL_MS)).toBe(false);
    expect(store.isLive('a')).toBe(false);
    expect(store.attempt('a', START + TTL_MS)).toBe('exhausted');
  });

  it('refuses new tokens at the cap until expired entries can be swept', () => {
    for (let i = 0; i < TWO_FACTOR_CHALLENGE_MAX_KEYS; i += 1) {
      store.attempt(`t${i}`, START + TTL_MS);
    }
    expect(store.attempt('late', START + TTL_MS)).toBe('refused');
    // Known tokens keep working at the cap.
    expect(store.attempt('t0', START + TTL_MS)).toBe('allowed');

    clock.time = START + TTL_MS;
    expect(store.attempt('late', clock.time + TTL_MS)).toBe('allowed');
  });
});
