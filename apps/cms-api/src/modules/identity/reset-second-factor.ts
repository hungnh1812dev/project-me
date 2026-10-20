import { Injectable } from '@nestjs/common';

/** DI token of the TOTP check required by password reset (D8). */
export const RESET_SECOND_FACTOR = Symbol('RESET_SECOND_FACTOR');

/**
 * D8: a password reset of an account with TOTP enabled also needs a valid
 * authenticator code. Called only after the emailed code checked out.
 */
export interface ResetSecondFactor {
  verify(accountId: number, totpCode: string | undefined): Promise<boolean>;
}

/**
 * T12 placeholder: fails closed, so a TOTP account can't be reset with the
 * email code alone. Nothing can enable TOTP before T13, so no one is locked
 * out. TODO(T13): bind RESET_SECOND_FACTOR to the real TOTP verifier
 * (last-step replay check included).
 */
@Injectable()
export class FailClosedResetSecondFactor implements ResetSecondFactor {
  verify(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
