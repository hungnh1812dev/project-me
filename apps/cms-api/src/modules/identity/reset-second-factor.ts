/** DI token of the TOTP check required by password reset (D8). */
export const RESET_SECOND_FACTOR = Symbol('RESET_SECOND_FACTOR');

/**
 * D8: a password reset of an account with TOTP enabled also needs a valid
 * authenticator code. Called only after the emailed code checked out.
 * Bound to TotpService (T13), which also stores the code's time step.
 */
export interface ResetSecondFactor {
  verify(accountId: number, totpCode: string | undefined): Promise<boolean>;
}
