import { API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';

import {
  graphqlFailureOf,
  isUnauthenticatedGraphqlError,
  readGraphqlRootFields,
  unwrapGraphqlResponse,
} from './GraphqlResponse.rules';

function thrownBy(run: () => unknown): WebApiError {
  try {
    run();
  } catch (error) {
    return error as WebApiError;
  }
  throw new Error('did not throw');
}

const OPERATION = 'Page';

function failedWith(status: number, body: unknown): WebApiError {
  return thrownBy(() => unwrapGraphqlResponse(status, body, OPERATION));
}

function graphqlError(init: { errorCode: WebApiError['errorCode']; statusCode?: number }) {
  return new WebApiError({ source: API_ERROR_SOURCES.CMS_API_GRAPHQL, ...init });
}

describe('unwrapGraphqlResponse', () => {
  it('returns data of a clean 200 answer', () => {
    expect(unwrapGraphqlResponse(200, { data: { a: 1 } }, OPERATION)).toEqual({ a: 1 });
  });

  it('throws UNKNOWN_ERROR for an API code outside the list, keeps it as upstream code and never the message', () => {
    const error = failedWith(200, {
      data: { a: 1 },
      errors: [
        { message: 'secret', extensions: { code: 'FIRST' } },
        { extensions: { code: 'SECOND' } },
      ],
    });
    expect(error).toBeInstanceOf(WebApiError);
    expect(error.source).toBe('cms-api-graphql');
    expect(error.errorCode).toBe('UNKNOWN_ERROR');
    expect(error.upstreamErrorCode).toBe('FIRST');
    expect(error.operation).toBe(OPERATION);
    expect(error.message).not.toContain('secret');
  });

  it('keeps UNAUTHENTICATED as its own code', () => {
    expect(
      failedWith(200, { errors: [{ extensions: { code: 'UNAUTHENTICATED' } }] }).errorCode,
    ).toBe('UNAUTHENTICATED');
  });

  it('uses UNKNOWN_ERROR for an error without extensions.code', () => {
    expect(failedWith(200, { errors: [{}] }).errorCode).toBe('UNKNOWN_ERROR');
  });

  it('throws on a non-200 answer and keeps its status', () => {
    const error = failedWith(502, 'bad gateway');
    expect(error.errorCode).toBe('HTTP_ERROR');
    expect(error.statusCode).toBe(502);
  });

  it('throws when the body has no data', () => {
    expect(failedWith(200, {}).errorCode).toBe('NO_DATA');
    expect(failedWith(200, undefined).errorCode).toBe('NO_DATA');
    expect(failedWith(200, { data: null }).errorCode).toBe('NO_DATA');
  });
});

describe('graphqlFailureOf', () => {
  it('is undefined for a clean read', () => {
    expect(graphqlFailureOf(200, undefined, true, OPERATION)).toBeUndefined();
  });

  it('names the failure of a partial answer by its error code', () => {
    expect(graphqlFailureOf(200, 'X', true, OPERATION)?.errorCode).toBe('UNKNOWN_ERROR');
  });
});

describe('isUnauthenticatedGraphqlError', () => {
  it('is true for an HTTP 401 and for the UNAUTHENTICATED code', () => {
    expect(
      isUnauthenticatedGraphqlError(graphqlError({ errorCode: 'HTTP_ERROR', statusCode: 401 })),
    ).toBe(true);
    expect(
      isUnauthenticatedGraphqlError(
        graphqlError({ errorCode: 'UNAUTHENTICATED', statusCode: 200 }),
      ),
    ).toBe(true);
  });

  it.each([
    ['a network error', graphqlError({ errorCode: 'NETWORK_ERROR' })],
    ['a 403', graphqlError({ errorCode: 'HTTP_ERROR', statusCode: 403 })],
    ['a 500', graphqlError({ errorCode: 'HTTP_ERROR', statusCode: 500 })],
    ['another code', graphqlError({ errorCode: 'UNKNOWN_ERROR', statusCode: 200 })],
    ['a plain Error', new Error('boom')],
  ])('is false for %s', (_name, error) => {
    expect(isUnauthenticatedGraphqlError(error)).toBe(false);
  });
});

describe('readGraphqlRootFields', () => {
  it('keeps the data of a partial answer and fails only the root field named by an error path', () => {
    expect(
      readGraphqlRootFields(200, {
        data: { a: 1, b: null },
        errors: [{ path: ['b', 'x'], extensions: { code: 'X' } }],
      }),
    ).toEqual({
      data: { a: 1, b: null },
      errorCode: 'X',
      status: 200,
      failedRootFields: new Set(['b']),
    });
  });

  it('fails every root field for an error without a path', () => {
    const read = readGraphqlRootFields(200, {
      data: { a: 1 },
      errors: [{ extensions: { code: 'X' } }],
    });
    expect(read.failedRootFields).toBe('all');
  });

  it('does not fail a null or empty root field that has no error', () => {
    const read = readGraphqlRootFields(200, { data: { a: null, b: [] } });
    expect(read.failedRootFields).toEqual(new Set());
  });

  it('gives no data for a non-200 answer or a body without a data object', () => {
    expect(readGraphqlRootFields(500, { data: { a: 1 } }).data).toBeNull();
    expect(readGraphqlRootFields(200, { errors: [{}] })).toMatchObject({
      data: null,
      errorCode: 'UNKNOWN_ERROR',
    });
    expect(readGraphqlRootFields(500, { data: { a: 1 } }).failedRootFields).toBe('all');
    expect(readGraphqlRootFields(200, 'nope').data).toBeNull();
    expect(readGraphqlRootFields(200, { data: [1] }).data).toBeNull();
  });
});
