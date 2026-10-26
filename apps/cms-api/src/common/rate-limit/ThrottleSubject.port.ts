import type { Request } from 'express';

export const THROTTLE_SUBJECT_RESOLVER = Symbol('THROTTLE_SUBJECT_RESOLVER');

/**
 * What the throttle guard needs to know about the caller. The app binds one
 * implementation (`RateLimitModule.forRoot`), so `common/rate-limit` does not
 * depend on how actors are modelled.
 */
export interface ThrottleSubjectResolver {
  /** Account id of the signed-in caller; other actors and anonymous give `undefined`. */
  accountSubjectOf(req: Request): string | undefined;
  isAnonymousRequest(req: Request): boolean;
}
