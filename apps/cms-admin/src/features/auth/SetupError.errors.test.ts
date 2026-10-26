import { AxiosError, type AxiosResponse } from 'axios';

import { API_ERROR_CODES } from '../../config/Http.constants';
import { toSetupError } from './SetupError.errors';

function failure(status: number, data?: unknown, headers = {}): AxiosError {
  const response = { status, data, headers } as AxiosResponse;
  return new AxiosError(
    'failed',
    AxiosError.ERR_BAD_REQUEST,
    undefined,
    null,
    response,
  );
}

describe('toSetupError', () => {
  it('maps 401 to an invalid token', () => {
    expect(toSetupError(failure(401))).toEqual({ kind: 'token-invalid' });
  });

  it('maps 404 to a closed setup', () => {
    expect(toSetupError(failure(404))).toEqual({ kind: 'setup-closed' });
  });

  it('maps 409 OWNER_EMAIL_TAKEN to a taken email', () => {
    const error = failure(409, {
      errorCode: API_ERROR_CODES.OWNER_EMAIL_TAKEN,
    });
    expect(toSetupError(error)).toEqual({ kind: 'email-taken' });
  });

  it('maps 400 to the field issues', () => {
    const issues = [
      { path: ['email'], message: 'must be a valid email address' },
    ];
    expect(toSetupError(failure(400, { details: { issues } }))).toEqual({
      kind: 'field-issues',
      issues,
    });
  });

  it('maps 429 to an alert with the wait time', () => {
    const error = failure(429, null, { 'retry-after': '120' });
    expect(toSetupError(error)).toMatchObject({
      kind: 'alert',
      message: expect.stringContaining('2 minutes') as string,
    });
  });

  it('maps a missing response and other statuses to an alert', () => {
    const noResponse = new AxiosError('Network Error', AxiosError.ERR_NETWORK);
    expect(toSetupError(noResponse).kind).toBe('alert');
    expect(toSetupError(failure(500)).kind).toBe('alert');
    expect(toSetupError(new Error('x')).kind).toBe('alert');
  });
});
