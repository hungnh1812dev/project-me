import { COPY } from '../../config/copy.constants';
import { reviewerAlertOf } from './reviewer-error';

const errors = COPY.reviewer.errors;

describe('reviewerAlertOf', () => {
  it.each([
    ['REVIEWER_DISABLED', errors.disabled, false],
    ['REVIEWER_UNAVAILABLE', errors.unavailable, true],
    ['REVIEWER_TURNSTILE_FAILED', errors.turnstileFailed, true],
    ['REVIEWER_IP_LIMITED', errors.ipLimited, true],
    ['REVIEWER_CAPACITY_REACHED', errors.capacity, true],
  ])('%s', (errorCode, message, resetChallenge) => {
    expect(reviewerAlertOf({ kind: 'http', status: 403, errorCode })).toEqual({
      tone: 'warning',
      message,
      resetChallenge,
    });
  });

  it('reads a plain 400 as rejected answers', () => {
    expect(
      reviewerAlertOf({ kind: 'http', status: 400, errorCode: undefined }),
    ).toMatchObject({ tone: 'error', message: errors.invalid });
  });

  it('formats the rate-limit wait', () => {
    expect(
      reviewerAlertOf({ kind: 'rate-limited', retryAfterSeconds: 30 }).message,
    ).toBe(errors.ipLimitedSeconds(30));
    expect(
      reviewerAlertOf({ kind: 'rate-limited', retryAfterSeconds: undefined })
        .message,
    ).toBe(errors.ipLimited);
  });

  it('handles network and unexpected failures', () => {
    expect(reviewerAlertOf({ kind: 'network' }).message).toBe(errors.network);
    expect(reviewerAlertOf({ kind: 'unexpected' }).message).toBe(
      errors.unexpected,
    );
  });
});
