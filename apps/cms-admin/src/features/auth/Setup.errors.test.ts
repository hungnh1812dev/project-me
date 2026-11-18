import { API_ERROR_CODES } from '@configs/Http.constants';
import { EN_TEXT } from '@configs/locales/en';
import { AxiosError, type AxiosResponse } from 'axios';

import { toSetupError } from './Setup.errors';

const SETUP_TEXT = { setup: EN_TEXT.setup };

function failure(status: number, data?: unknown, headers = {}): AxiosError {
  const response = { status, data, headers } as AxiosResponse;
  return new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, undefined, null, response);
}

describe('toSetupError', () => {
  it('maps 401 to an invalid token', () => {
    expect(toSetupError(failure(401), SETUP_TEXT)).toEqual({ kind: 'token-invalid' });
  });

  it('maps 404 to a closed setup', () => {
    expect(toSetupError(failure(404), SETUP_TEXT)).toEqual({ kind: 'setup-closed' });
  });

  it('maps 409 OWNER_EMAIL_TAKEN to a taken email', () => {
    const error = failure(409, {
      errorCode: API_ERROR_CODES.OWNER_EMAIL_TAKEN,
    });
    expect(toSetupError(error, SETUP_TEXT)).toEqual({ kind: 'email-taken' });
  });

  it('maps 400 to the field issues', () => {
    const issues = [{ path: ['email'], message: 'must be a valid email address' }];
    expect(toSetupError(failure(400, { details: { issues } }), SETUP_TEXT)).toEqual({
      kind: 'field-issues',
      issues,
    });
  });

  it('maps 429 to an alert with the wait time', () => {
    const error = failure(429, null, { 'retry-after': '120' });
    expect(toSetupError(error, SETUP_TEXT)).toMatchObject({
      kind: 'alert',
      message: expect.stringContaining('2 minutes') as string,
    });
  });

  it('maps a missing response and other statuses to an alert', () => {
    const noResponse = new AxiosError('Network Error', AxiosError.ERR_NETWORK);
    expect(toSetupError(noResponse, SETUP_TEXT).kind).toBe('alert');
    expect(toSetupError(failure(500), SETUP_TEXT).kind).toBe('alert');
    expect(toSetupError(new Error('x'), SETUP_TEXT).kind).toBe('alert');
  });
});
