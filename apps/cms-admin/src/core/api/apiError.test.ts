import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { describe, expect, it } from 'vitest';

import { ApiError, isApiError, toApiError } from './apiError';

function axiosHttpError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  const response = {
    status,
    statusText: '',
    data,
    headers: {},
    config,
  } as AxiosResponse;
  return new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_REQUEST,
    config,
    {},
    response,
  );
}

describe('toApiError', () => {
  it('keeps a Nest string message', () => {
    const error = toApiError(
      axiosHttpError(401, {
        statusCode: 401,
        message: 'Invalid credentials',
        error: 'Unauthorized',
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.message).toBe('Invalid credentials');
    expect(error.messages).toEqual(['Invalid credentials']);
    expect(error.code).toBe('ERR_BAD_REQUEST');
    expect(error.body).toEqual({
      statusCode: 401,
      message: 'Invalid credentials',
      error: 'Unauthorized',
    });
  });

  it('joins a Nest message array with ", " and keeps the raw array', () => {
    const error = toApiError(
      axiosHttpError(400, {
        statusCode: 400,
        message: ['email must be an email', 'password is too short'],
        error: 'Bad Request',
      }),
    );

    expect(error.status).toBe(400);
    expect(error.message).toBe('email must be an email, password is too short');
    expect(error.messages).toEqual(['email must be an email', 'password is too short']);
  });

  it('falls back to a status message for a non-Nest body', () => {
    const error = toApiError(axiosHttpError(502, '<html>Bad gateway</html>'));

    expect(error.status).toBe(502);
    expect(error.message).toBe('Request failed with status 502');
    expect(error.messages).toEqual(['Request failed with status 502']);
    expect(error.body).toBe('<html>Bad gateway</html>');
  });

  it('falls back when a Nest message is an empty string', () => {
    const error = toApiError(axiosHttpError(500, { statusCode: 500, message: '' }));

    expect(error.message).toBe('Request failed with status 500');
  });

  it('falls back when a Nest message array has no strings', () => {
    const error = toApiError(axiosHttpError(400, { message: [] }));

    expect(error.message).toBe('Request failed with status 400');
  });

  it('maps a network error without a response to status 0', () => {
    const error = toApiError(new AxiosError('Network Error', AxiosError.ERR_NETWORK));

    expect(error.status).toBe(0);
    expect(error.message).toBe('Cannot reach the server. Check your connection and try again.');
    expect(error.code).toBe('ERR_NETWORK');
  });

  it('maps a timeout to status 0 with a timeout message', () => {
    const error = toApiError(new AxiosError('timeout of 10ms exceeded', AxiosError.ECONNABORTED));

    expect(error.status).toBe(0);
    expect(error.message).toBe('The request timed out. Try again.');
    expect(error.code).toBe('ECONNABORTED');
  });

  it('wraps a non-axios Error with status 0 and its message', () => {
    const error = toApiError(new TypeError('boom'));

    expect(error.status).toBe(0);
    expect(error.message).toBe('boom');
    expect(error.messages).toEqual(['boom']);
  });

  it('wraps a non-Error throw with a generic message', () => {
    const error = toApiError('oops');

    expect(error.status).toBe(0);
    expect(error.message).toBe('Something went wrong.');
    expect(error.body).toBe('oops');
  });

  it('returns an ApiError unchanged', () => {
    const original = new ApiError({ status: 403, message: 'Forbidden' });

    expect(toApiError(original)).toBe(original);
  });
});

describe('ApiError', () => {
  it('defaults messages to the single message', () => {
    const error = new ApiError({ status: 404, message: 'Not found' });

    expect(error.messages).toEqual(['Not found']);
    expect(error.name).toBe('ApiError');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('isApiError', () => {
  it('is true only for ApiError instances', () => {
    expect(isApiError(new ApiError({ status: 500, message: 'x' }))).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError({ status: 500, message: 'x' })).toBe(false);
  });
});
