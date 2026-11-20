import { DOMAIN_ERROR_KINDS, DomainError } from '../../../common/errors/Domain.errors';
import {
  HUMAN_CHECK_ERROR_CODES,
  HUMAN_CHECK_FORMS,
  TURNSTILE_TOKEN_MAX_LENGTH,
  type HumanCheckOutcome,
} from '../domain/HumanCheck.rules';
import type { TurnstileVerifier } from './HumanCheck.port';
import { HumanCheckService } from './HumanCheck.service';

function serviceWith(outcome: HumanCheckOutcome, isConfigured = true) {
  const verify = jest.fn<
    ReturnType<TurnstileVerifier['verify']>,
    Parameters<TurnstileVerifier['verify']>
  >(() => Promise.resolve(outcome));
  return { service: new HumanCheckService({ isConfigured, verify }), verify };
}

async function refusalOf(call: Promise<void>): Promise<DomainError> {
  try {
    await call;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('HumanCheckService.assertPassed', () => {
  it('passes a token the verifier accepts and sends the form id and client IP', async () => {
    const { service, verify } = serviceWith('passed');
    await expect(
      service.assertPassed(HUMAN_CHECK_FORMS.LOGIN, 'token', '203.0.113.9'),
    ).resolves.toBeUndefined();
    expect(verify).toHaveBeenCalledWith('token', '203.0.113.9', 'login');
  });

  it('refuses 400 HUMAN_CHECK_FAILED when the verifier fails the token', async () => {
    const { service } = serviceWith('failed');
    const error = await refusalOf(service.assertPassed(HUMAN_CHECK_FORMS.LOGIN, 't', undefined));
    expect(error.kind).toBe(DOMAIN_ERROR_KINDS.INVALID_INPUT);
    expect(error.errorCode).toBe(HUMAN_CHECK_ERROR_CODES.FAILED);
  });

  it('refuses 503 HUMAN_CHECK_UNAVAILABLE when the verifier has no answer', async () => {
    const { service } = serviceWith('unavailable');
    const error = await refusalOf(service.assertPassed(HUMAN_CHECK_FORMS.LOGIN, 't', undefined));
    expect(error.kind).toBe(DOMAIN_ERROR_KINDS.UNAVAILABLE);
    expect(error.errorCode).toBe(HUMAN_CHECK_ERROR_CODES.UNAVAILABLE);
  });

  it('fails closed with 503 and no verify call when no secret is configured', async () => {
    const { service, verify } = serviceWith('passed', false);
    const error = await refusalOf(service.assertPassed(HUMAN_CHECK_FORMS.LOGIN, 't', undefined));
    expect(error.errorCode).toBe(HUMAN_CHECK_ERROR_CODES.UNAVAILABLE);
    expect(verify).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a string', 42],
    ['too long', 't'.repeat(TURNSTILE_TOKEN_MAX_LENGTH + 1)],
  ])('refuses 400 without a verify call when the token is %s', async (_name, token) => {
    const { service, verify } = serviceWith('passed');
    const error = await refusalOf(service.assertPassed(HUMAN_CHECK_FORMS.LOGIN, token, undefined));
    expect(error.errorCode).toBe(HUMAN_CHECK_ERROR_CODES.FAILED);
    expect(verify).not.toHaveBeenCalled();
  });
});
