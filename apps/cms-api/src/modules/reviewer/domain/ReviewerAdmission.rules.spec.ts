import { REVIEWER_ACCOUNT } from './Reviewer.constants';
import {
  REVIEWER_IP_WINDOW_MS,
  REVIEWER_MAX_ACTIVE_SESSIONS,
  isReviewerAtCapacity,
  isReviewerSessionActive,
  retryAfterSecondsOf,
  reviewerIpLimited,
} from './ReviewerAdmission.rules';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/Domain.errors';

const NOW = 1_000_000_000;

describe('ReviewerAdmission.rules', () => {
  it('is at capacity from the cap upward', () => {
    expect(isReviewerAtCapacity(REVIEWER_MAX_ACTIVE_SESSIONS - 1)).toBe(false);
    expect(isReviewerAtCapacity(REVIEWER_MAX_ACTIVE_SESSIONS)).toBe(true);
  });

  it('rounds the retry delay up and never answers below 1 second', () => {
    expect(retryAfterSecondsOf(NOW, NOW)).toBe(REVIEWER_IP_WINDOW_MS / 1000);
    expect(retryAfterSecondsOf(NOW - REVIEWER_IP_WINDOW_MS + 1, NOW)).toBe(1);
    expect(retryAfterSecondsOf(NOW - REVIEWER_IP_WINDOW_MS - 5000, NOW)).toBe(
      1,
    );
  });

  it('counts a session active only before expiry and with the initial token version', () => {
    const expiresAt = new Date(NOW + 1);
    const initial = REVIEWER_ACCOUNT.INITIAL_TOKEN_VERSION;
    expect(
      isReviewerSessionActive({ expiresAt, accountTokenVersion: initial }, NOW),
    ).toBe(true);
    expect(
      isReviewerSessionActive(
        { expiresAt: new Date(NOW), accountTokenVersion: initial },
        NOW,
      ),
    ).toBe(false);
    expect(
      isReviewerSessionActive(
        { expiresAt, accountTokenVersion: initial + 1 },
        NOW,
      ),
    ).toBe(false);
  });

  it('builds a rate_limited error carrying the Retry-After seconds', () => {
    const error = reviewerIpLimited(42);
    expect(error.kind).toBe(DOMAIN_ERROR_KINDS.RATE_LIMITED);
    expect(error.retryAfterSeconds).toBe(42);
  });
});
