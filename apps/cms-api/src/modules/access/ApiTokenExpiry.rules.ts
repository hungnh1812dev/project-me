/**
 * The one definition of "this API token is expired" (SPEC D5): the expiry
 * instant itself already counts as expired. Authentication, the list status
 * and the update guard all call this, so they agree to the millisecond.
 */
export function isApiTokenExpired(
  expiresAt: Date | null,
  nowMs: number,
): boolean {
  return expiresAt !== null && expiresAt.getTime() <= nowMs;
}
