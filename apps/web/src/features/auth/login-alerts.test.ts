import { AxiosError } from 'axios';

import { COPY } from '../../config/copy.constants';
import { PrivilegedAccessError } from './auth.api';
import { credentialAlertOf, loginErrorAlertOf } from './login-alerts';

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
    expect(
      loginErrorAlertOf(new AxiosError('down'), (failure) => failure.kind),
    ).toBe('network');
  });
});

describe('credentialAlertOf', () => {
  it('reads a 4xx as incorrect credentials and a 5xx as unexpected', () => {
    expect(
      credentialAlertOf({ kind: 'http', status: 401, errorCode: undefined }),
    ).toEqual({ tone: 'error', message: errors.invalidCredentials });
    expect(
      credentialAlertOf({ kind: 'http', status: 500, errorCode: undefined }),
    ).toEqual({ tone: 'error', message: errors.unexpected });
  });
});
