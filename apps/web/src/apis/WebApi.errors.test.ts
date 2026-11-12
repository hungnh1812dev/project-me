import { afterEach, describe, expect, it, vi } from 'vitest';

import { GRAPHQL_FAILURE_CODES } from '@/apis/GraphqlResponse.rules';
import { BFF_ERROR_CODES } from '@/apis/server/bff/Bff.errors';
import { SERVER_API_FAILURE_CODES } from '@/apis/server/restful/ServerApi.client';

import { API_ERROR_CODES, API_ERROR_SOURCES, logApiError, WebApiError } from './WebApi.errors';

describe('API_ERROR_CODES', () => {
  it('keeps every code of the server RESTful, GraphQL and BFF layers', () => {
    expect(Object.values(API_ERROR_CODES.SERVER_API).sort()).toEqual(
      Object.values(SERVER_API_FAILURE_CODES).sort(),
    );
    expect(Object.values(API_ERROR_CODES.GRAPHQL).sort()).toEqual(
      Object.values(GRAPHQL_FAILURE_CODES).sort(),
    );
    expect(Object.values(API_ERROR_CODES.BFF).sort()).toEqual(Object.keys(BFF_ERROR_CODES).sort());
  });

  it('has the four client failure kinds', () => {
    expect(Object.keys(API_ERROR_CODES.CLIENT)).toHaveLength(4);
  });
});

describe('WebApiError', () => {
  it('holds every field and uses the code as message', () => {
    const error = new WebApiError({
      source: API_ERROR_SOURCES.BFF,
      errorCode: API_ERROR_CODES.BFF.RATE_LIMITED,
      statusCode: 429,
      operation: '/api/v1/login',
      retryable: true,
      retryAfterSeconds: 30,
      upstreamErrorCode: 'RATE_LIMITED',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('BFF_RATE_LIMITED');
    expect(error).toMatchObject({
      source: 'bff',
      errorCode: 'BFF_RATE_LIMITED',
      statusCode: 429,
      operation: '/api/v1/login',
      retryable: true,
      retryAfterSeconds: 30,
      upstreamErrorCode: 'RATE_LIMITED',
    });
  });

  it('defaults to not retryable with optional fields unset', () => {
    const error = new WebApiError({
      source: API_ERROR_SOURCES.CLIENT,
      errorCode: API_ERROR_CODES.CLIENT.NETWORK,
    });
    expect(error.retryable).toBe(false);
    expect(error.statusCode).toBeUndefined();
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('logs source, code, status and operation only', () => {
    const error = new WebApiError({
      source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
      errorCode: API_ERROR_CODES.GRAPHQL.HTTP,
      statusCode: 500,
      operation: 'SiteShell',
      upstreamErrorCode: 'SECRET_DETAIL',
    });
    expect(error.toLogLine()).toBe('cms-api-graphql HTTP_ERROR 500 SiteShell');
  });

  it('writes the log line with `-` for missing values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    logApiError(
      new WebApiError({
        source: API_ERROR_SOURCES.CLIENT,
        errorCode: API_ERROR_CODES.CLIENT.UNEXPECTED,
      }),
    );
    expect(warn).toHaveBeenCalledExactlyOnceWith('[api-error] client CLIENT_UNEXPECTED - -');
  });
});

afterEach(() => vi.restoreAllMocks());
