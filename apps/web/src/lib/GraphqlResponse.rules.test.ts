import {
  GraphqlRequestError,
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
