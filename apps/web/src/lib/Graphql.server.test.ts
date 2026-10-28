import { fetchGraphql } from './Graphql.server';
import { GraphqlRequestError } from './GraphqlResponse.rules';

vi.mock('../config/Server.env', () => ({
  getServerEnv: () => ({
    apiInternalUrl: 'http://api.internal/api/v1',
    revalidateSeconds: 60,
  }),
}));

const DOCUMENT = { query: 'query Q { a }', operationName: 'Q' };
const fetchMock = vi.fn<typeof fetch>();

function answer(status: number, body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchGraphql', () => {
  it('posts the operation anonymously and caches by the revalidate time', async () => {
    answer(200, { data: { a: 1 } });

    const data = await fetchGraphql<{ a: number }>(DOCUMENT, { id: 'x' });

    expect(data).toEqual({ a: 1 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.internal/api/v1/graphql');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      ...DOCUMENT,
      variables: { id: 'x' },
    });
    const headerNames = Object.keys(init.headers as object).map((name) =>
      name.toLowerCase(),
    );
    expect(headerNames).not.toContain('authorization');
    expect(headerNames).not.toContain('cookie');
    expect(headerNames).not.toContain('x-forwarded-for');
    expect((init as { next?: unknown }).next).toEqual({ revalidate: 60 });
  });

  it('throws with the first error code when the answer has errors', async () => {
    answer(200, { errors: [{ extensions: { code: 'BAD_INPUT' } }] });
    await expect(fetchGraphql(DOCUMENT)).rejects.toMatchObject({
      code: 'BAD_INPUT',
    });
  });

  it('throws on a non-200 answer', async () => {
    answer(500, { message: 'boom' });
    await expect(fetchGraphql(DOCUMENT)).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      status: 500,
    });
  });

  it('turns a network failure into the typed error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(fetchGraphql(DOCUMENT)).rejects.toBeInstanceOf(
      GraphqlRequestError,
    );
  });

  it('never puts the variables in the error', async () => {
    answer(500, {});
    const error = await fetchGraphql(DOCUMENT, { password: 'hunter2' }).catch(
      (caught: unknown) => caught as GraphqlRequestError,
    );
    expect(JSON.stringify(error)).not.toContain('hunter2');
    expect((error as Error).message).not.toContain('hunter2');
  });
});
