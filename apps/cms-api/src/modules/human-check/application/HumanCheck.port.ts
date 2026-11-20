import type { HumanCheckOutcome } from '../domain/HumanCheck.rules';

/** DI token for the Turnstile verifier. */
export const TURNSTILE_VERIFIER = Symbol('TURNSTILE_VERIFIER');

export interface TurnstileVerifier {
  /** False when no secret key is set: `verify` then always answers `unavailable`. */
  readonly isConfigured: boolean;
  /**
   * Server-side verification of the widget's response token. With
   * `expectedAction` the reply must name that form id; without it the action
   * is not compared (reviewer sessions).
   */
  verify(
    responseToken: string,
    remoteIp?: string,
    expectedAction?: string,
  ): Promise<HumanCheckOutcome>;
}
