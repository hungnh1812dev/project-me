import {
  DomainError,
  DOMAIN_ERROR_KINDS,
  type DomainErrorKind,
} from '../../../common/errors/Domain.errors';
import {
  MS_PER_MINUTE,
  MS_PER_SECOND,
} from '../../../common/constants/time.constants';
import type { PageMeta } from '../../../common/validation/SharedSchemas.rules';
import {
  REVIEWER_ACCOUNT,
  REVIEWER_ERROR_CODES,
  REVIEWER_ERROR_MESSAGES,
} from './Reviewer.constants';

/** SPEC §6: 1 session per IP per 10 min, 200 active sessions at most. */
export const REVIEWER_IP_WINDOW_MS = 10 * MS_PER_MINUTE;
export const REVIEWER_MAX_ACTIVE_SESSIONS = 200;

export interface ReviewerStatusView {
  readonly enabled: boolean;
}

/** 201 body: the 24 h access token (no refresh token, no cookie). */
export interface CreatedReviewerSessionView {
  readonly accessToken: string;
  readonly expiresAt: string;
}

/** `GET /reviewer/sessions` item. The IP (even hashed) is never returned. */
export interface ReviewerSessionView {
  /** The ephemeral reviewer account's `document_id`. */
  readonly id: string;
  readonly visitorRole: string;
  readonly purposeTags: readonly string[];
  /** Plain text: render as text, never as HTML. */
  readonly notes: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly active: boolean;
}

export interface ReviewerSessionPage {
  readonly data: ReviewerSessionView[];
  readonly meta: PageMeta;
}

export function isReviewerAtCapacity(activeSessions: number): boolean {
  return activeSessions >= REVIEWER_MAX_ACTIVE_SESSIONS;
}

/** At least 1 s, so the `Retry-After` header is never 0. */
export function retryAfterSecondsOf(
  lastSessionCreatedAtMs: number,
  nowMs: number,
): number {
  const seconds = Math.ceil(
    (lastSessionCreatedAtMs + REVIEWER_IP_WINDOW_MS - nowMs) / MS_PER_SECOND,
  );
  return Math.max(1, seconds);
}

/** Not expired, and not revoked by a switch-off (`token_version` bumped). */
export function isReviewerSessionActive(
  session: { expiresAt: Date; accountTokenVersion: number },
  nowMs: number,
): boolean {
  return (
    session.expiresAt.getTime() > nowMs &&
    session.accountTokenVersion === REVIEWER_ACCOUNT.INITIAL_TOKEN_VERSION
  );
}

/** 429 with the seconds until the visitor's address may start another session. */
export function reviewerIpLimited(retryAfterSeconds: number): DomainError {
  return new DomainError({
    kind: DOMAIN_ERROR_KINDS.RATE_LIMITED,
    errorCode: REVIEWER_ERROR_CODES.IP_LIMITED,
    message: REVIEWER_ERROR_MESSAGES.IP_LIMITED,
    retryAfterSeconds,
  });
}

function refusal(
  kind: DomainErrorKind,
  code: keyof typeof REVIEWER_ERROR_CODES,
) {
  return new DomainError({
    kind,
    errorCode: REVIEWER_ERROR_CODES[code],
    message: REVIEWER_ERROR_MESSAGES[code],
  });
}

/** 403: the owner has switched reviewer access off. */
export const reviewerDisabled = (): DomainError =>
  refusal(DOMAIN_ERROR_KINDS.FORBIDDEN, 'DISABLED');

/** 503: Turnstile or the IP key is not configured, or Turnstile could not be reached. */
export const reviewerUnavailable = (): DomainError =>
  refusal(DOMAIN_ERROR_KINDS.UNAVAILABLE, 'UNAVAILABLE');

/** 400: Cloudflare refused the visitor's token. */
export const reviewerTurnstileFailed = (): DomainError =>
  refusal(DOMAIN_ERROR_KINDS.INVALID_INPUT, 'TURNSTILE_FAILED');

/** 503: the global cap of active sessions is reached. */
export const reviewerCapacityReached = (): DomainError =>
  refusal(DOMAIN_ERROR_KINDS.UNAVAILABLE, 'CAPACITY_REACHED');
