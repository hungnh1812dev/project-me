import { apiClient } from './Api.client';
import { requestGraphql } from './Graphql.client';
import { GraphqlRequestError } from './GraphqlResponse.rules';

const DOCUMENT = { query: 'query Q { a }', operationName: 'Q' };

afterEach(() => vi.restoreAllMocks());

describe('requestGraphql', () => {
  it('posts with the Bearer token and returns data', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ status: 200, data: { data: { a: 1 } } });

    const data = await requestGraphql(DOCUMENT, { id: 'x' }, 'tok');

    expect(data).toEqual({ a: 1 });
    const [path, body, config] = post.mock.calls[0] as [
      string,
      unknown,
      { headers: Record<string, string> },
    ];
    expect(path).toBe('/graphql');
    expect(body).toEqual({ ...DOCUMENT, variables: { id: 'x' } });
    expect(config.headers.Authorization).toBe('Bearer tok');
  });

  it('maps an errors entry to the first error code', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      status: 200,
      data: { errors: [{ extensions: { code: 'FORBIDDEN' } }] },
    });
    await expect(
      requestGraphql(DOCUMENT, undefined, 't'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('maps a non-200 answer and a network failure to the typed error', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      status: 401,
      data: {},
    });
    await expect(
      requestGraphql(DOCUMENT, undefined, 't'),
    ).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 401 });

    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('offline'));
    await expect(
      requestGraphql(DOCUMENT, undefined, 't'),
    ).rejects.toBeInstanceOf(GraphqlRequestError);
  });
});
