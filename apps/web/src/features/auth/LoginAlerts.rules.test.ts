import { AxiosError } from 'axios';

import { COPY } from '../../configs/Copy.constants';
import { PrivilegedAccessError } from '../session';
import { credentialAlertOf, loginErrorAlertOf } from './LoginAlerts.rules';

const { errors } = COPY.login;

describe('loginErrorAlertOf', () => {
  it('checks a privileged account before mapping the failure', () => {
    const mapFailure = vi.fn<() => string>(() => 'mapped');
    expect(loginErrorAlertOf(new PrivilegedAccessError(), mapFailure)).toEqual({
      tone: 'warning',
      message: errors.privileged,
    });
    expect(mapFailure).not.toHaveBeenCalled();
  });

  it('maps any other error through its failure', () => {
    expect(loginErrorAlertOf(new AxiosError('down'), (failure) => failure.kind)).toBe('network');
  });
});

describe('credentialAlertOf', () => {
  const http = (errorCode: string | undefined, status = 400) =>
    credentialAlertOf({ kind: 'http', status, errorCode });

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
    expect(credentialAlertOf({ kind: 'rate-limited', retryAfterSeconds: 30 })).toEqual({
      tone: 'warning',
      message: errors.rateLimitedSeconds(30),
    });
    expect(credentialAlertOf({ kind: 'network' })).toEqual({
      tone: 'warning',
      message: errors.network,
    });
  });
});
