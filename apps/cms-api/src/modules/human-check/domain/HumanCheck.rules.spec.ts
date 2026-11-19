import { DOMAIN_ERROR_KINDS } from '../../../common/errors/Domain.errors';
import {
  HUMAN_CHECK_ERROR_CODES,
  HUMAN_CHECK_FORMS,
  humanCheckFailed,
  humanCheckUnavailable,
  judgeSiteverifyAnswer,
  TURNSTILE_TOKEN_MAX_LENGTH,
  turnstileTokenSchema,
  withoutTurnstileToken,
  type SiteverifyAnswer,
} from './HumanCheck.rules';

function answerOf(overrides: Partial<SiteverifyAnswer> = {}): SiteverifyAnswer {
  return { success: true, action: 'login', hostname: 'web.test', errorCodes: [], ...overrides };
}

const ANY_PAGE = { expectedAction: undefined, expectedHostnames: [] };

describe('judgeSiteverifyAnswer', () => {
  it('passes a successful answer when nothing is expected', () => {
    expect(judgeSiteverifyAnswer(answerOf(), ANY_PAGE)).toBe('passed');
  });

  it('is unavailable without an answer', () => {
    expect(judgeSiteverifyAnswer(undefined, ANY_PAGE)).toBe('unavailable');
  });

  it('fails a refused token', () => {
    const refused = answerOf({ success: false, errorCodes: ['invalid-input-response'] });
    expect(judgeSiteverifyAnswer(refused, ANY_PAGE)).toBe('failed');
    expect(judgeSiteverifyAnswer(answerOf({ success: false, errorCodes: [] }), ANY_PAGE)).toBe(
      'failed',
    );
  });

  it('fails an already used token', () => {
    const used = answerOf({ success: false, errorCodes: ['timeout-or-duplicate'] });
    expect(judgeSiteverifyAnswer(used, ANY_PAGE)).toBe('failed');
  });

  it('is unavailable when Cloudflare reports an internal error', () => {
    const internal = answerOf({ success: false, errorCodes: ['internal-error'] });
    expect(judgeSiteverifyAnswer(internal, ANY_PAGE)).toBe('unavailable');
  });

  it('compares the action only when one is expected', () => {
    const expectation = { expectedAction: HUMAN_CHECK_FORMS.LOGIN, expectedHostnames: [] };
    expect(judgeSiteverifyAnswer(answerOf({ action: 'login' }), expectation)).toBe('passed');
    expect(judgeSiteverifyAnswer(answerOf({ action: 'two-factor' }), expectation)).toBe('failed');
    expect(judgeSiteverifyAnswer(answerOf({ action: undefined }), expectation)).toBe('failed');
    expect(judgeSiteverifyAnswer(answerOf({ action: 'two-factor' }), ANY_PAGE)).toBe('passed');
  });

  it('accepts a hostname from the list, ignoring case, and refuses any other', () => {
    const expectation = {
      expectedAction: undefined,
      expectedHostnames: ['web.test', 'admin.test'],
    };
    expect(judgeSiteverifyAnswer(answerOf({ hostname: 'Admin.Test' }), expectation)).toBe('passed');
    expect(judgeSiteverifyAnswer(answerOf({ hostname: 'evil.test' }), expectation)).toBe('failed');
    expect(judgeSiteverifyAnswer(answerOf({ hostname: undefined }), expectation)).toBe('failed');
  });

  it('does not read the hostname when the list is empty', () => {
    expect(judgeSiteverifyAnswer(answerOf({ hostname: undefined }), ANY_PAGE)).toBe('passed');
  });
});

describe('turnstileTokenSchema', () => {
  it('takes 1 to 2048 characters', () => {
    expect(turnstileTokenSchema.safeParse('t').success).toBe(true);
    expect(turnstileTokenSchema.safeParse('t'.repeat(TURNSTILE_TOKEN_MAX_LENGTH)).success).toBe(
      true,
    );
    expect(turnstileTokenSchema.safeParse('').success).toBe(false);
    expect(turnstileTokenSchema.safeParse('t'.repeat(TURNSTILE_TOKEN_MAX_LENGTH + 1)).success).toBe(
      false,
    );
    expect(turnstileTokenSchema.safeParse(7).success).toBe(false);
  });
});

describe('human check refusals', () => {
  it('answers 400 HUMAN_CHECK_FAILED with a fixed message', () => {
    const error = humanCheckFailed();
    expect(error.kind).toBe(DOMAIN_ERROR_KINDS.INVALID_INPUT);
    expect(error.errorCode).toBe(HUMAN_CHECK_ERROR_CODES.FAILED);
    expect(error.hasMessage).toBe(true);
  });

  it('answers 503 HUMAN_CHECK_UNAVAILABLE with a fixed message', () => {
    const error = humanCheckUnavailable();
    expect(error.kind).toBe(DOMAIN_ERROR_KINDS.UNAVAILABLE);
    expect(error.errorCode).toBe(HUMAN_CHECK_ERROR_CODES.UNAVAILABLE);
    expect(error.hasMessage).toBe(true);
  });
});

describe('withoutTurnstileToken', () => {
  it('drops the token field and keeps the rest', () => {
    expect(withoutTurnstileToken({ email: 'a@b.c', turnstileToken: 't' })).toEqual({
      email: 'a@b.c',
    });
  });
});
