import { API_ERROR_SOURCES, WebApiError } from '../../WebApi.errors';
import { defineContentQuery, runContentQuery, runVisitorQuery } from './Graphql.server';

const env = vi.hoisted(() => {
  const state: {
    appApiToken: string | undefined;
    revalidateOverrideSeconds: number | undefined;
    isMockFallbackOn: boolean;
  } = {
    appApiToken: 'api-token-secret',
    revalidateOverrideSeconds: undefined,
    isMockFallbackOn: false,
  };
  return state;
});
vi.mock('../../../configs/Server.env', () => ({ getServerEnv: () => env }));

type PostOptions = { headers: Record<string, string>; body: { query: string }; cache: unknown };
const postMock = vi.hoisted(() =>
  vi.fn<(path: string, options: PostOptions) => Promise<unknown>>(),
);
vi.mock('../restful/ServerApi.client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../restful/ServerApi.client')>()),
  serverApi: { post: postMock },
}));

function restFailure(errorCode: 'NETWORK' | 'TIMEOUT'): WebApiError {
  return new WebApiError({
    source: API_ERROR_SOURCES.CMS_API_REST,
    errorCode,
    retryable: errorCode === 'TIMEOUT',
  });
}

const mockView = vi.hoisted<{ MOCK_VIEW: Record<string, unknown> }>(() => ({ MOCK_VIEW: {} }));
vi.mock('./mocks/MockView', () => mockView);
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

interface PageData {
  alpha: { title: string };
  beta: { items: string[] };
}
const ROOT_FIELDS = { alpha: '{ title }', beta: '{ items }' };
const PAGE = defineContentQuery<PageData>({ operationName: 'Page', rootFields: ROOT_FIELDS });
const SLOW_PAGE = defineContentQuery<PageData>({
  operationName: 'Page',
  rootFields: ROOT_FIELDS,
  revalidateSeconds: 30,
});

function answer(status: number, body: unknown) {
  return { status, headers: new Headers(), body };
}

function callOptions(index: number): PostOptions {
  return (postMock.mock.calls[index] as [string, PostOptions])[1];
}

beforeEach(() => {
  postMock.mockReset();
  env.appApiToken = 'api-token-secret';
  env.revalidateOverrideSeconds = undefined;
  env.isMockFallbackOn = false;
  mockView.MOCK_VIEW = {};
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('defineContentQuery', () => {
  it('builds the document from the root fields', () => {
    expect(PAGE.document).toEqual({
      operationName: 'Page',
      query: 'query Page {\nalpha{ title }\nbeta{ items }\n}',
    });
  });
});

describe('runContentQuery', () => {
  it('sends the API token as Bearer and caches for the default seconds', async () => {
    postMock.mockResolvedValue(
      answer(200, { data: { alpha: { title: 'a' }, beta: { items: ['x'] } } }),
    );

    const result = await runContentQuery(PAGE);

    expect(result).toEqual({
      data: { alpha: { title: 'a' }, beta: { items: ['x'] } },
      failedRootFields: [],
    });
    expect(postMock.mock.calls[0]?.[0]).toBe('/graphql');
    expect(callOptions(0).headers).toMatchObject({ authorization: 'Bearer api-token-secret' });
    expect(callOptions(0).cache).toEqual({ revalidateSeconds: 180 });
    expect(callOptions(0).body).toBe(PAGE.document);
  });

  it('goes anonymous without a token and uses the query own cache seconds', async () => {
    env.appApiToken = undefined;
    postMock.mockResolvedValue(
      answer(200, { data: { alpha: { title: 'a' }, beta: { items: ['x'] } } }),
    );

    await runContentQuery(SLOW_PAGE);

    expect(Object.keys(callOptions(0).headers)).not.toContain('authorization');
    expect(callOptions(0).cache).toEqual({ revalidateSeconds: 30 });
  });

  it('fills only the failed root field of a partial answer', async () => {
    env.isMockFallbackOn = true;
    mockView.MOCK_VIEW = { alpha: { title: 'mock' }, beta: { items: ['mock'] } };
    postMock.mockResolvedValue(
      answer(200, {
        data: { alpha: { title: 'real' }, beta: null },
        errors: [{ path: ['beta'], extensions: { code: 'FORBIDDEN' } }],
      }),
    );

    const result = await runContentQuery(PAGE);

    expect(result.data).toEqual({ alpha: { title: 'real' }, beta: { items: ['mock'] } });
    expect(result.failedRootFields).toEqual([]);
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith('[mock] Page beta beta UNKNOWN_ERROR');
  });

  it('lists the failed root fields as null when the mocks are off, without retrying', async () => {
    postMock.mockResolvedValue(
      answer(200, { errors: [{ extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }] }),
    );

    const result = await runContentQuery(PAGE);

    expect(result.data).toEqual({ alpha: null, beta: null });
    expect(result.failedRootFields).toEqual(['alpha', 'beta']);
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('asks each root field alone when the whole operation is rejected and the mocks are on', async () => {
    env.isMockFallbackOn = true;
    mockView.MOCK_VIEW = { beta: { items: ['mock'] } };
    postMock
      .mockResolvedValueOnce(answer(400, { errors: [{ extensions: { code: 'BAD' } }] }))
      .mockResolvedValueOnce(answer(200, { data: { alpha: { title: 'real' } } }))
      .mockResolvedValueOnce(answer(400, { errors: [{ extensions: { code: 'BAD' } }] }));

    const result = await runContentQuery(PAGE);

    expect(result.data).toEqual({ alpha: { title: 'real' }, beta: { items: ['mock'] } });
    expect(postMock).toHaveBeenCalledTimes(3);
    expect([1, 2].map((index) => callOptions(index).body.query)).toEqual([
      'query Page {\nalpha{ title }\n}',
      'query Page {\nbeta{ items }\n}',
    ]);
    for (const index of [1, 2]) {
      expect(callOptions(index).cache).toEqual({ revalidateSeconds: 180 });
      expect(callOptions(index).headers).toMatchObject({
        authorization: 'Bearer api-token-secret',
      });
    }
  });

  it('fills a root field named by an error path even when the answer is 200', async () => {
    env.isMockFallbackOn = true;
    mockView.MOCK_VIEW = { alpha: { title: 'mock' }, beta: { items: ['mock'] } };
    postMock.mockResolvedValue(
      answer(200, {
        data: { alpha: { title: 'real' }, beta: null },
        errors: [{ path: ['beta', 0], extensions: { code: 'FORBIDDEN' } }],
      }),
    );

    const result = await runContentQuery(PAGE);

    expect(result.data).toEqual({ alpha: { title: 'real' }, beta: { items: ['mock'] } });
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('treats an error without a path as a failure of every root field and asks each alone', async () => {
    env.isMockFallbackOn = true;
    mockView.MOCK_VIEW = { beta: { items: ['mock'] } };
    postMock
      .mockResolvedValueOnce(
        answer(200, {
          data: { alpha: { title: 'real' }, beta: null },
          errors: [{ extensions: { code: 'BAD' } }],
        }),
      )
      .mockResolvedValueOnce(answer(200, { data: { alpha: { title: 'real' } } }))
      .mockResolvedValueOnce(answer(200, { errors: [{ extensions: { code: 'BAD' } }] }));

    const result = await runContentQuery(PAGE);

    expect(result.data).toEqual({ alpha: { title: 'real' }, beta: { items: ['mock'] } });
    expect(postMock).toHaveBeenCalledTimes(3);
  });

  it('returns a null root field without an error as null, with no mock and not failed', async () => {
    env.isMockFallbackOn = true;
    mockView.MOCK_VIEW = { alpha: { title: 'mock' }, beta: { items: ['mock'] } };
    postMock.mockResolvedValue(answer(200, { data: { alpha: null, beta: { items: [] } } }));

    const result = await runContentQuery(PAGE);

    expect(result).toEqual({ data: { alpha: null, beta: { items: [] } }, failedRootFields: [] });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('picks the mock by the mock key of the root field', async () => {
    env.isMockFallbackOn = true;
    mockView.MOCK_VIEW = { sharedAlpha: { title: 'keyed mock' } };
    const keyed = defineContentQuery<PageData>({
      operationName: 'Page',
      rootFields: ROOT_FIELDS,
      mockKeys: { alpha: 'sharedAlpha' as never },
    });
    postMock.mockRejectedValue(restFailure('NETWORK'));

    const result = await runContentQuery(keyed);

    expect(result.data.alpha).toEqual({ title: 'keyed mock' });
    expect(result.failedRootFields).toEqual(['beta']);
  });

  it('never throws on a transport failure and never prints the token', async () => {
    postMock.mockRejectedValue(restFailure('NETWORK'));

    const result = await runContentQuery(PAGE);

    expect(result.failedRootFields).toEqual(['alpha', 'beta']);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('api-token-secret');
  });

  it('reports a timeout as the mock reason', async () => {
    env.isMockFallbackOn = true;
    mockView.MOCK_VIEW = { alpha: { title: 'mock' }, beta: { items: [] } };
    postMock.mockRejectedValue(restFailure('TIMEOUT'));

    await runContentQuery(PAGE);

    expect(console.warn).toHaveBeenCalledWith('[mock] Page alpha alpha TIMEOUT');
  });
});

describe('runVisitorQuery', () => {
  it('sends only the visitor token, uncached, and returns the data', async () => {
    postMock.mockResolvedValue(answer(200, { data: { alpha: { title: 'a' } } }));

    const data = await runVisitorQuery<PageData>(PAGE, 'visitor-token');

    expect(data).toEqual({ alpha: { title: 'a' } });
    expect(callOptions(0).headers).toMatchObject({ authorization: 'Bearer visitor-token' });
    expect(JSON.stringify(callOptions(0).headers)).not.toContain('api-token-secret');
    expect(callOptions(0).cache).toBe('no-store');
  });

  it('throws the first error code, never fills a mock and never retries', async () => {
    env.isMockFallbackOn = true;
    mockView.MOCK_VIEW = { alpha: { title: 'mock' } };
    postMock.mockResolvedValue(answer(200, { errors: [{ extensions: { code: 'BAD_INPUT' } }] }));

    await expect(runVisitorQuery(PAGE, 'visitor-token')).rejects.toMatchObject({
      source: 'cms-api-graphql',
      errorCode: 'UNKNOWN_ERROR',
      upstreamErrorCode: 'BAD_INPUT',
      operation: 'Page',
    });
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('turns a transport failure into the typed error without the token', async () => {
    postMock.mockRejectedValue(restFailure('NETWORK'));

    const error = await runVisitorQuery(PAGE, 'visitor-token').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WebApiError);
    expect(error).toMatchObject({ errorCode: 'NETWORK_ERROR', source: 'cms-api-graphql' });
    expect(JSON.stringify(error)).not.toContain('visitor-token');
    expect((error as Error).message).not.toContain('visitor-token');
  });
});
