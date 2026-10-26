import {
  LOGIN_FAILURE_REASONS,
  type LoginFailureReason,
} from '../../security-audit';
import { REFRESH_TOKEN_REUSE_GRACE_MS } from './Identity.constants';

const ACTIVE_ACCOUNT_STATUS = 'active';

/** What a sign-in decision reads of an account. */
export interface LoginAccountFacts {
  readonly passwordHash: string | null;
  readonly status: string;
  readonly deletedAt: Date | null;
}

/** Why a sign-in fails, or undefined when it may go on. */
export function loginFailureReason(
  account: LoginAccountFacts | null,
  isPasswordCorrect: boolean,
): LoginFailureReason | undefined {
  if (account === null) return LOGIN_FAILURE_REASONS.UNKNOWN_ACCOUNT;
  if (account.passwordHash === null) return LOGIN_FAILURE_REASONS.NO_PASSWORD;
  if (!isPasswordCorrect) return LOGIN_FAILURE_REASONS.BAD_PASSWORD;
  if (account.status !== ACTIVE_ACCOUNT_STATUS || account.deletedAt !== null) {
    return LOGIN_FAILURE_REASONS.NOT_ACTIVE;
  }
  return undefined;
}

/** The successor token a rotation created. */
export interface RotationSuccessorFacts {
  readonly familyId: string;
  readonly replacedById: number | null;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date;
}

/** An already-rotated refresh token that came back, with what the decision reads. */
export interface RotatedTokenFacts {
  readonly familyId: string;
  /** When it was rotated (rotation revokes it). */
  readonly revokedAt: Date | null;
  readonly successor: RotationSuccessorFacts | null;
  readonly account: Pick<LoginAccountFacts, 'status' | 'deletedAt'>;
}

/**
 * A rotated token that returns within the grace window, with its successor
 * still live and unused and the account active, is a concurrent refresh.
 * Anything else is reuse (the family is revoked).
 */
export function isRefreshInGrace(token: RotatedTokenFacts, now: Date): boolean {
  const rotatedAt = token.revokedAt?.getTime();
  const { successor, account } = token;
  return (
    rotatedAt !== undefined &&
    now.getTime() - rotatedAt <= REFRESH_TOKEN_REUSE_GRACE_MS &&
    successor !== null &&
    successor.familyId === token.familyId &&
    successor.replacedById === null &&
    successor.revokedAt === null &&
    successor.expiresAt > now &&
    account.status === ACTIVE_ACCOUNT_STATUS &&
    account.deletedAt === null
  );
}
