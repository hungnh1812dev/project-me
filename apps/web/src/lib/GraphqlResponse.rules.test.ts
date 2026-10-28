import {
  GraphqlRequestError,
  isUnauthenticatedGraphqlError,
  unwrapGraphqlResponse,
} from './GraphqlResponse.rules';

function thrownBy(run: () => unknown): GraphqlRequestError {
  try {
    run();
  } catch (error) {
    return error as GraphqlRequestError;
  }
  throw new Error('did not throw');
}

describe('unwrapGraphqlResponse', () => {
  it('returns data of a clean 200 answer', () => {
    expect(unwrapGraphqlResponse(200, { data: { a: 1 } })).toEqual({ a: 1 });
  });

  it('throws the first error code even when data is present', () => {
    const error = thrownBy(() =>
      unwrapGraphqlResponse(200, {
        data: { a: 1 },
        errors: [
          { message: 'secret', extensions: { code: 'FIRST' } },
          { extensions: { code: 'SECOND' } },
        ],
      }),
    );
    expect(error).toBeInstanceOf(GraphqlRequestError);
    expect(error.code).toBe('FIRST');
    expect(error.message).not.toContain('secret');
  });

  it('uses a fixed code for an error without extensions.code', () => {
    expect(
      thrownBy(() => unwrapGraphqlResponse(200, { errors: [{}] })).code,
    ).toBe('UNKNOWN_ERROR');
  });

  it('throws on a non-200 answer and keeps its status', () => {
    const error = thrownBy(() => unwrapGraphqlResponse(502, 'bad gateway'));
    expect(error.code).toBe('HTTP_ERROR');
    expect(error.status).toBe(502);
  });

  it('throws when the body has no data', () => {
    expect(thrownBy(() => unwrapGraphqlResponse(200, {})).code).toBe('NO_DATA');
    expect(thrownBy(() => unwrapGraphqlResponse(200, undefined)).code).toBe(
      'NO_DATA',
    );
    expect(
      thrownBy(() => unwrapGraphqlResponse(200, { data: null })).code,
    ).toBe('NO_DATA');
  });
});

describe('isUnauthenticatedGraphqlError', () => {
  it('is true for an HTTP 401 and for the UNAUTHENTICATED code', () => {
    expect(
      isUnauthenticatedGraphqlError(new GraphqlRequestError('HTTP_ERROR', 401)),
    ).toBe(true);
    expect(
      isUnauthenticatedGraphqlError(
        new GraphqlRequestError('UNAUTHENTICATED', 200),
      ),
    ).toBe(true);
  });

  it.each([
    ['a network error', new GraphqlRequestError('NETWORK_ERROR')],
    ['a 403', new GraphqlRequestError('HTTP_ERROR', 403)],
    ['a 500', new GraphqlRequestError('HTTP_ERROR', 500)],
    ['another code', new GraphqlRequestError('FORBIDDEN', 200)],
    ['a plain Error', new Error('boom')],
  ])('is false for %s', (_name, error) => {
    expect(isUnauthenticatedGraphqlError(error)).toBe(false);
  });
});
