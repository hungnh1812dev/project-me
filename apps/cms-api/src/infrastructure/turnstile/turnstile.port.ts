/** DI token for the Turnstile verifier. */
export const TURNSTILE_VERIFIER = Symbol('TURNSTILE_VERIFIER');

/** Cloudflare documents response tokens of at most 2048 characters. */
export const TURNSTILE_TOKEN_MAX_LENGTH = 2_048;

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
