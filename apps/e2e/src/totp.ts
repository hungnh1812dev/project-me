import { generate } from 'otplib';

import { MS_PER_SECOND, TOTP_PERIOD_SECONDS } from './constants';

/** RFC 6238 time step of an epoch-ms instant. */
export function totpStepAt(epochMs: number): number {
  return Math.floor(epochMs / MS_PER_SECOND / TOTP_PERIOD_SECONDS);
}

/**
 * A code from a step after `usedStep`: cms-api stores the last accepted step
 * per account and rejects codes at or below it (no replay). Waits for the
 * next step when needed (at most one period).
 */
export async function freshTotpCode(
  secret: string,
  usedStep: number | undefined,
): Promise<{ code: string; step: number }> {
  if (usedStep !== undefined) {
    const nextStepStartMs =
      (usedStep + 1) * TOTP_PERIOD_SECONDS * MS_PER_SECOND;
    const waitMs = nextStepStartMs - Date.now();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  const now = Date.now();
  return {
    code: await generate({ secret, epoch: Math.floor(now / MS_PER_SECOND) }),
    step: totpStepAt(now),
  };
}
