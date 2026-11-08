import { SERVER_API_FAILURE_CODES, serverApi, ServerApiError } from './ServerApi.client';

vi.mock('@/configs/Server.env', () => ({
  getServerEnv: () => ({ apiInternalUrl: 'http://api.internal/api/v1' }),
}));

const fetchMock = vi.fn<typeof fetch>();

function answer(status: number, body?: string, headers: HeadersInit = {}) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(body ?? null, { status, headers })),
  );
}

function sentRequest(): { request: Request; init: Record<string, unknown> | undefined } {
  const [request, init] = fetchMock.mock.calls[0] as [Request, Record<string, unknown> | undefined];
  return { request, init };
}

async function failureOf(call: Promise<unknown>): Promise<ServerApiError> {
  const error = await call.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(ServerApiError);
  return error as ServerApiError;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('serverApi', () => {
  it.each([
    ['get', 'GET'],
    ['post', 'POST'],
    ['put', 'PUT'],
    ['patch', 'PATCH'],
    ['delete', 'DELETE'],
  ] as const)('%s sends the %s verb to the base URL plus the path', async (method, verb) => {
    answer(200, '{}');

    await serverApi[method]('/things');

    const { request } = sentRequest();
    expect(request.method).toBe(verb);
    expect(request.url).toBe('http://api.internal/api/v1/things');
  });

  it('sends the headers and the body as JSON, and returns the parsed answer', async () => {
    answer(200, '{"ok":true}', { 'x-reply': 'yes' });

    const result = await serverApi.post('/things', {
      headers: { Authorization: 'Bearer token' },
      body: { a: 1 },
    });

    const { request } = sentRequest();
    expect(request.headers.get('authorization')).toBe('Bearer token');
    expect(request.headers.get('content-type')).toContain('application/json');
    expect(await request.text()).toBe('{"a":1}');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
    expect(result.headers.get('x-reply')).toBe('yes');
  });

  it('keeps every Set-Cookie line', async () => {
    answer(200, '{}', [
      ['set-cookie', 'a=1; Path=/'],
      ['set-cookie', 'b=2; Path=/'],
    ]);

    const result = await serverApi.post('/things');

    expect(result.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('caches for the default seconds when the caller sets none', async () => {
    answer(200, '{}');

    await serverApi.get('/things');

    expect(sentRequest().init).toMatchObject({ next: { revalidate: 180 } });
  });

  it('passes the revalidate seconds of the caller to fetch', async () => {
    answer(200, '{}');

    await serverApi.get('/things', { cache: { revalidateSeconds: 30 } });

    expect(sentRequest().init).toMatchObject({ next: { revalidate: 30 } });
  });

  it('passes no-store to fetch', async () => {
    answer(200, '{}');

    await serverApi.get('/things', { cache: 'no-store' });

    const { init } = sentRequest();
    expect(init).toMatchObject({ cache: 'no-store' });
    expect(init).not.toHaveProperty('next');
  });

  it('never follows a redirect and reports it as REDIRECT', async () => {
    answer(302, undefined, { location: 'http://elsewhere/' });

    const error = await failureOf(serverApi.get('/things'));

    expect(error.code).toBe(SERVER_API_FAILURE_CODES.REDIRECT);
    expect(sentRequest().request.redirect).toBe('manual');
  });

  it.each([400, 401, 404, 429, 500, 503])('answers %i instead of throwing', async (status) => {
    answer(status, '{"errorCode":"X"}');

    const result = await serverApi.get('/things');

    expect(result.status).toBe(status);
    expect(result.body).toEqual({ errorCode: 'X' });
  });

  it('gives NETWORK without the upstream message or the request data', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed: secret-host Bearer token'));

    const error = await failureOf(
      serverApi.post('/things', { headers: { Authorization: 'Bearer token' }, body: { pw: 'x' } }),
    );

    expect(error.code).toBe(SERVER_API_FAILURE_CODES.NETWORK);
    expect(JSON.stringify([error.message, error.stack])).not.toMatch(/secret-host|Bearer|"pw"/);
  });

  it('gives TIMEOUT when the upstream is slower than timeoutMs', async () => {
    fetchMock.mockImplementation((input) => {
      const { signal } = input as Request;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason as Error));
      });
    });

    const error = await failureOf(serverApi.get('/things', { timeoutMs: 20 }));

    expect(error.code).toBe(SERVER_API_FAILURE_CODES.TIMEOUT);
  });

  it('leaves the body undefined when the answer has none or is not JSON', async () => {
    answer(204);
    expect((await serverApi.delete('/things')).body).toBeUndefined();

    answer(502, '<html>bad gateway</html>');
    expect((await serverApi.get('/things')).body).toBeUndefined();
  });

  it('gives INVALID_BODY for an unreadable body only when the caller needs one', async () => {
    answer(200, '<html>not json</html>');
    const error = await failureOf(serverApi.get('/things', { needsBody: true }));
    expect(error.code).toBe(SERVER_API_FAILURE_CODES.INVALID_BODY);

    answer(200);
    const empty = await failureOf(serverApi.get('/things', { needsBody: true }));
    expect(empty.code).toBe(SERVER_API_FAILURE_CODES.INVALID_BODY);
  });
});
