import { Injectable } from '@nestjs/common';

import { Clock } from '../../common/time/clock';
import {
  TWO_FACTOR_CHALLENGE_MAX_KEYS,
  TWO_FACTOR_TEMP_TOKEN_MAX_ATTEMPTS,
} from './identity-auth.constants';

interface ChallengeEntry {
  attempts: number;
  used: boolean;
  /** Epoch ms when the temp token expires; the entry can go after it. */
  readonly expiresAt: number;
}

/** Outcome of asking to check a code with a temp token. */
export type ChallengeAttempt =
  /** One attempt counted; go on and check the code. */
  | 'allowed'
  /** Used, or all attempts spent: the temp token is dead. */
  | 'exhausted'
  /** Store full even after a sweep (fail closed, answer 429). */
  | 'refused';

/**
 * T13 Q7: per temp token (`jti`) state for SPEC §6 "5 attempts": attempts
 * counted and single use. In memory, like the rate-limit store, so one
 * replica only; a restart forgets counters, but tokens still expire after
 * 300 s and verify stays IP-throttled. Capped at
 * TWO_FACTOR_CHALLENGE_MAX_KEYS live entries.
 */
@Injectable()
export class TwoFactorChallengeStore {
  private readonly entries = new Map<string, ChallengeEntry>();

  constructor(private readonly clock: Clock) {}

  /** Counts one code check for `jti` unless the token is used or spent. */
  attempt(jti: string, expiresAt: number): ChallengeAttempt {
    const entry = this.entryFor(jti, expiresAt);
    if (entry === undefined) return 'refused';
    if (entry.used || entry.attempts >= TWO_FACTOR_TEMP_TOKEN_MAX_ATTEMPTS) {
      return 'exhausted';
    }
    entry.attempts += 1;
    return 'allowed';
  }

  /** True while the token can still be used (no attempt counted). */
  isLive(jti: string): boolean {
    const entry = this.entries.get(jti);
    return (
      entry === undefined ||
      (!entry.used && entry.attempts < TWO_FACTOR_TEMP_TOKEN_MAX_ATTEMPTS)
    );
  }

  /**
   * Marks the token used after a correct code. False when it already was
   * (a concurrent request won), so only one session is issued.
   */
  markUsed(jti: string, expiresAt: number): boolean {
    const entry = this.entries.get(jti) ?? this.entryFor(jti, expiresAt);
    if (entry === undefined || entry.used) return false;
    entry.used = true;
    return true;
  }

  private entryFor(jti: string, expiresAt: number): ChallengeEntry | undefined {
    const existing = this.entries.get(jti);
    if (existing !== undefined) return existing;
    if (this.entries.size >= TWO_FACTOR_CHALLENGE_MAX_KEYS) {
      this.sweep();
      if (this.entries.size >= TWO_FACTOR_CHALLENGE_MAX_KEYS) return undefined;
    }
    const entry: ChallengeEntry = { attempts: 0, used: false, expiresAt };
    this.entries.set(jti, entry);
    return entry;
  }

  private sweep(): void {
    const now = this.clock.now();
    for (const [jti, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(jti);
    }
  }
}
