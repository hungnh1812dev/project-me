import { API_ERROR_SOURCES, WebApiError } from '../../WebApi.errors';
import { executeGraphql, requireRootField } from './Graphql.server';

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

type PostOptions = {
  headers: Record<string, string>;
  body: { query: string; variables?: Record<string, string> };
  next: { revalidate?: number };
  resolveData: (answer: { status: number; body: unknown }) => unknown;
};
const postMock = vi.hoisted(() =>
  vi.fn<(path: string, options: PostOptions) => Promise<unknown>>(),
);
vi.mock('../restful/ServerApi.client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../restful/ServerApi.client')>()),
  serverApi: {
    post: async (path: string, options: PostOptions) =>
      options.resolveData((await postMock(path, options)) as { status: number; body: unknown }),
  },
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

const QUERY = 'query Page {\n  header { name }\n}';
const DATA = { header: { name: 'Abyss' } };
const MOCKED = { header: { name: 'Mock' } };

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

function turnMocksOn() {
  env.isMockFallbackOn = true;
  mockView.MOCK_VIEW = { 'site-header': MOCKED };
}

const logged = () => vi.mocked(console.warn).mock.calls.map(([line]) => String(line));

describe('executeGraphql request', () => {
  it('posts the query with the API token as Bearer and returns data', async () => {
    postMock.mockResolvedValue(answer(200, { data: DATA }));
    await expect(executeGraphql(QUERY)).resolves.toEqual(DATA);
    expect(callOptions(0).body).toEqual({ query: QUERY });
    expect(callOptions(0).headers).toMatchObject({
      authorization: 'Bearer api-token-secret',
      accept: 'application/json',
    });
  });

  it('sends variables as the body variables, and none without them', async () => {
    postMock.mockResolvedValue(answer(200, { data: DATA }));
    await executeGraphql(QUERY, { variables: { documentId: 'doc-1' } });
    await executeGraphql(QUERY);
    expect(callOptions(0).body).toEqual({ query: QUERY, variables: { documentId: 'doc-1' } });
    expect(callOptions(1).body).toEqual({ query: QUERY });
  });

  it('goes anonymous without a token and passes next on', async () => {
    env.appApiToken = undefined;
    postMock.mockResolvedValue(answer(200, { data: DATA }));
    await executeGraphql(QUERY, { next: { revalidate: 30, tags: ['page'] } });
    expect(callOptions(0).headers).not.toHaveProperty('authorization');
    expect(callOptions(0).next).toEqual({ revalidate: 30, tags: ['page'] });
  });

  it('sends the visitor token, uncached, and never the API token', async () => {
    postMock.mockResolvedValue(answer(200, { data: DATA }));
    await executeGraphql(QUERY, { accessToken: 'visitor', next: { revalidate: 60 } });
    expect(callOptions(0).headers).toMatchObject({ authorization: 'Bearer visitor' });
    expect(callOptions(0).next).toEqual({ revalidate: 0 });
  });

  it('passes the data through resolveData', async () => {
    postMock.mockResolvedValue(answer(200, { data: DATA }));
    await expect(executeGraphql(QUERY, { resolveData: () => 'resolved' })).resolves.toBe(
      'resolved',
    );
  });

  it('returns an empty collection as an answer, not a failure', async () => {
    turnMocksOn();
    postMock.mockResolvedValue(answer(200, { data: { list: { data: [] } } }));
    await expect(executeGraphql(QUERY, { mock: 'site-header' })).resolves.toEqual({
      list: { data: [] },
    });
    expect(logged()).toEqual([]);
  });
});

describe('executeGraphql failures with the mocks on', () => {
  beforeEach(turnMocksOn);

  it.each([
    ['a non-2xx answer', () => answer(500, {})],
    ['HTTP 200 with errors', () => answer(200, { data: DATA, errors: [{ message: 'x' }] })],
    ['a body with no data', () => answer(200, { nope: true })],
  ])('mocks %s as a whole', async (_label, makeAnswer) => {
    postMock.mockResolvedValue(makeAnswer());
    await expect(executeGraphql(QUERY, { mock: 'site-header' })).resolves.toEqual(MOCKED);
    expect(logged().some((line) => line.startsWith('[mock] Page site-header'))).toBe(true);
  });

  it('mocks a transport failure', async () => {
    postMock.mockRejectedValue(restFailure('TIMEOUT'));
    await expect(executeGraphql(QUERY, { mock: 'site-header' })).resolves.toEqual(MOCKED);
    expect(logged()).toContain('[mock] Page site-header NETWORK_ERROR');
  });

  it('mocks when resolveData throws, and when requireRootField finds a null root field', async () => {
    postMock.mockResolvedValue(answer(200, { data: { header: null } }));
    const resolveData = requireRootField<typeof MOCKED>('header');
    await expect(executeGraphql(QUERY, { mock: 'site-header', resolveData })).resolves.toEqual(
      MOCKED,
    );
    expect(logged()).toContain('[mock] Page site-header NO_DATA');
  });

  it('passes the mock through resolveData', async () => {
    postMock.mockResolvedValue(answer(500, {}));
    await expect(
      executeGraphql(QUERY, { mock: 'site-header', resolveData: () => 'from mock' }),
    ).resolves.toBe('from mock');
  });

  it('never mocks a call with an accessToken', async () => {
    postMock.mockResolvedValue(answer(500, {}));
    await expect(
      executeGraphql(QUERY, { mock: 'site-header', accessToken: 'visitor' }),
    ).rejects.toMatchObject({ errorCode: 'HTTP_ERROR' });
  });
});

describe('executeGraphql failures with the mocks off', () => {
  it('throws the typed error and logs one line, never the token', async () => {
    postMock.mockResolvedValue(
      answer(200, { errors: [{ extensions: { code: 'UNAUTHENTICATED' } }] }),
    );
    await expect(executeGraphql(QUERY, { mock: 'site-header' })).rejects.toMatchObject({
      errorCode: 'UNAUTHENTICATED',
      operation: 'Page',
    });
    expect(logged()).toEqual(['[api-error] cms-api-graphql UNAUTHENTICATED 200 Page']);
    expect(logged().join()).not.toContain('api-token-secret');
  });

  it('logs no variable value when a read with variables fails', async () => {
    postMock.mockResolvedValue(answer(200, { errors: [{ message: 'doc-secret-id' }] }));
    await expect(
      executeGraphql(QUERY, { variables: { documentId: 'doc-secret-id' } }),
    ).rejects.toBeInstanceOf(WebApiError);
    expect(logged()).toHaveLength(1);
    expect(logged().join()).not.toContain('doc-secret-id');
  });

  it('turns a transport failure into NETWORK_ERROR and keeps retryable', async () => {
    postMock.mockRejectedValue(restFailure('TIMEOUT'));
    await expect(executeGraphql(QUERY)).rejects.toMatchObject({
      source: 'cms-api-graphql',
      errorCode: 'NETWORK_ERROR',
      retryable: true,
    });
  });

  it('turns a throwing resolveData into its WebApiError code, else UNKNOWN_ERROR', async () => {
    postMock.mockResolvedValue(answer(200, { data: { header: null } }));
    await expect(
      executeGraphql(QUERY, { resolveData: requireRootField('header') }),
    ).rejects.toMatchObject({ errorCode: 'NO_DATA', operation: 'Page' });
    await expect(
      executeGraphql(QUERY, {
        resolveData: () => {
          throw new Error('bad shape');
        },
      }),
    ).rejects.toMatchObject({ errorCode: 'UNKNOWN_ERROR' });
  });
});

describe('requireRootField', () => {
  it('returns the data when the root field has a value', () => {
    expect(requireRootField('header')(DATA)).toBe(DATA);
  });

  it.each([[{ header: null }], [{}], [null]])('throws NO_DATA for %j', (data) => {
    expect(() => requireRootField('header')(data)).toThrow('NO_DATA');
  });
});
