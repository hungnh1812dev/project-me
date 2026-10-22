/** DI token for the Turnstile verifier (T31). */
export const TURNSTILE_VERIFIER = Symbol('TURNSTILE_VERIFIER');

/**
 * `passed`: the challenge was solved. `failed`: Cloudflare refused the token.
 * `unavailable`: no answer (not configured, network error, bad reply); the
 * caller must fail closed.
 */
export type TurnstileOutcome = 'passed' | 'failed' | 'unavailable';

export interface TurnstileVerifier {
  /** False when no secret key is set: `verify` then always answers `unavailable`. */
  readonly configured: boolean;
  /** Server-side verification of the widget's response token. */
  verify(responseToken: string, remoteIp?: string): Promise<TurnstileOutcome>;
}
