import { AxiosError } from 'axios';

import { SITE_SHELL_MOCK } from '@/apis/server/restful/mocks/SiteShell.mock';

import { PrivilegedAccessError } from '../session';
import { credentialAlertOf, loginErrorAlertOf, rateLimitedMessage } from './LoginAlerts.rules';

const { errors } = SITE_SHELL_MOCK.signInText;

describe('loginErrorAlertOf', () => {
  it('checks a privileged account before mapping the failure', () => {
    const mapFailure = vi.fn<() => string>(() => 'mapped');
    expect(loginErrorAlertOf(new PrivilegedAccessError(), errors, mapFailure)).toEqual({
      tone: 'warning',
      message: errors.privileged,
    });
    expect(mapFailure).not.toHaveBeenCalled();
  });

  it('maps any other error through its failure', () => {
    expect(loginErrorAlertOf(new AxiosError('down'), errors, (failure) => failure.kind)).toBe(
      'network',
    );
  });
});

describe('rateLimitedMessage', () => {
  it.each([
    [undefined, errors.rateLimited],
    [1, 'Too many sign-in attempts. Try again in 1 second.'],
    [59, 'Too many sign-in attempts. Try again in 59 seconds.'],
    [60, 'Too many sign-in attempts. Try again in 1 minute.'],
    [61, 'Too many sign-in attempts. Try again in 2 minutes.'],
  ])('reads %s seconds as one wait message', (seconds, message) => {
    expect(rateLimitedMessage(seconds, errors)).toBe(message);
  });
});

describe('credentialAlertOf', () => {
  const http = (errorCode: string | undefined, status = 400) =>
    credentialAlertOf({ kind: 'http', status, errorCode }, errors);

  it('reads BFF_INVALID_CREDENTIALS as one generic message', () => {
    expect(http('BFF_INVALID_CREDENTIALS', 401)).toEqual({
      tone: 'error',
      message: errors.invalidCredentials,
    });
  });

  it.each([
    ['BFF_HUMAN_CHECK_FAILED', 'error', errors.humanCheckFailed],
    ['BFF_HUMAN_CHECK_UNAVAILABLE', 'warning', errors.humanCheckUnavailable],
    ['BFF_PRIVILEGED_ACCOUNT', 'warning', errors.privileged],
  ] as const)('maps %s', (code, tone, message) => {
    expect(http(code)).toEqual({ tone, message });
  });

  it('reads any other code, with or without a status, as unexpected', () => {
    expect(http('BFF_INVALID_REQUEST')).toEqual({ tone: 'error', message: errors.unexpected });
    expect(http(undefined, 500)).toEqual({ tone: 'error', message: errors.unexpected });
  });

  it('maps a rate limit to its wait and a network failure to a warning', () => {
    expect(credentialAlertOf({ kind: 'rate-limited', retryAfterSeconds: 30 }, errors)).toEqual({
      tone: 'warning',
      message: 'Too many sign-in attempts. Try again in 30 seconds.',
    });
    expect(credentialAlertOf({ kind: 'network' }, errors)).toEqual({
      tone: 'warning',
      message: errors.network,
    });
  });
});
