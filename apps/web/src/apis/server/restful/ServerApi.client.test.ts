import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';

import { serverApi } from './ServerApi.client';

const env = vi.hoisted(() => ({
  appApiUrl: 'http://api.internal/api/v1',
  appApiOrigin: 'http://api.internal',
  revalidateOverrideSeconds: undefined as number | undefined,
}));

vi.mock('@/configs/Server.env', () => ({ getServerEnv: () => env }));
vi.mock('@/configs/Http.constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/configs/Http.constants')>()),
  API_TIMEOUT_MS: 20,
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

async function failureOf(call: Promise<unknown>): Promise<WebApiError> {
  const error = await call.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(WebApiError);
  return error as WebApiError;
}

beforeEach(() => {
  env.revalidateOverrideSeconds = undefined;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('serverApi', () => {
  it('resolves an isRootPath call against the origin and any other against the base URL', async () => {
    answer(200, '{}');
    await serverApi.get('/health/live', { isRootPath: true });
    expect(sentRequest().request.url).toBe('http://api.internal/health/live');
    fetchMock.mockClear();
    answer(200, '{}');
    await serverApi.get('/things', { isRootPath: false });
    expect(sentRequest().request.url).toBe('http://api.internal/api/v1/things');
  });

  it.each([
    ['get', 'GET'],
    ['post', 'POST'],
    ['put', 'PUT'],
    ['patch', 'PATCH'],
    ['delete', 'DELETE'],
    ['options', 'OPTIONS'],
  ] as const)('%s sends the %s verb to the base URL plus the path', async (method, verb) => {
    answer(200, '{}');

    await serverApi[method]('/things');

    const { request } = sentRequest();
    expect(request.method).toBe(verb);
    expect(request.url).toBe('http://api.internal/api/v1/things');
  });

  it('request takes the method as its first argument', async () => {
    answer(200, '{}');

    await serverApi.request('PATCH', '/things');

    expect(sentRequest().request.method).toBe('PATCH');
  });

  it('sends the headers and the body as JSON, and returns the parsed answer', async () => {
    answer(200, '{"ok":true}', { 'x-reply': 'yes' });

    const result = await serverApi.post('/things', {
      headers: { Authorization: 'Bearer token' },
      body: { a: 1 },
      resolveData: (raw) => raw,
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

    const result = await serverApi.post('/things', { resolveData: (raw) => raw });

    expect(result.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('caches for the default seconds when the caller sets none', async () => {
    answer(200, '{}');

    await serverApi.get('/things');

    expect(sentRequest().init).toMatchObject({ next: { revalidate: 180 } });
  });

  it('passes the revalidate seconds of the caller to fetch', async () => {
    answer(200, '{}');

    await serverApi.get('/things', { next: { revalidate: 30, tags: ['a'] } });

    expect(sentRequest().init).toMatchObject({ next: { revalidate: 30, tags: ['a'] } });
  });

  it('replaces a revalidate value with the WEB_REVALIDATE_SECONDS override', async () => {
    env.revalidateOverrideSeconds = 5;
    answer(200, '{}');

    await serverApi.get('/things', { next: { revalidate: 30 } });

    expect(sentRequest().init).toMatchObject({ next: { revalidate: 5 } });
  });

  it('keeps revalidate 0 as no-store when an override is set', async () => {
    env.revalidateOverrideSeconds = 5;
    answer(200, '{}');

    await serverApi.get('/things', { next: { revalidate: 0 } });

    expect(sentRequest().init).toMatchObject({ cache: 'no-store' });
  });

  it('passes revalidate 0 to fetch as no-store', async () => {
    answer(200, '{}');

    await serverApi.get('/things', { next: { revalidate: 0 } });

    const { init } = sentRequest();
    expect(init).toMatchObject({ cache: 'no-store' });
    expect(init).not.toHaveProperty('next');
  });

  it('never follows a redirect and reports it as REDIRECT', async () => {
    answer(302, undefined, { location: 'http://elsewhere/' });

    const error = await failureOf(serverApi.get('/things'));

    expect(error.errorCode).toBe(API_ERROR_CODES.SERVER_API.REDIRECT);
    expect(error.statusCode).toBe(302);
    expect(sentRequest().request.redirect).toBe('manual');
  });

  it('returns the parsed body of a 2xx without resolveData', async () => {
    answer(200, '{"ok":true}');

    expect(await serverApi.get('/things')).toEqual({ ok: true });
  });

  it('returns undefined for a 2xx without a JSON body', async () => {
    answer(204);
    expect(await serverApi.delete('/things')).toBeUndefined();

    answer(200, '<html>not json</html>');
    expect(await serverApi.get('/things')).toBeUndefined();
  });

  it.each([400, 401, 404, 429, 500, 503])(
    'throws HTTP_ERROR for %i without resolveData, logged once',
    async (status) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      answer(status, '{"errorCode":"X"}');

      const error = await failureOf(serverApi.get('/things'));

      expect(error.errorCode).toBe(API_ERROR_CODES.SERVER_API.HTTP);
      expect(error.source).toBe(API_ERROR_SOURCES.CMS_API_REST);
      expect(error.statusCode).toBe(status);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    },
  );

  it.each([200, 404, 500])(
    'gives resolveData the status, headers and body of a %i',
    async (status) => {
      answer(status, '{"errorCode":"X"}', { 'x-reply': 'yes' });

      const seen = await serverApi.get('/things', {
        resolveData: (raw) => ({
          status: raw.status,
          reply: raw.headers.get('x-reply'),
          body: raw.body,
        }),
      });

      expect(seen).toEqual({ status, reply: 'yes', body: { errorCode: 'X' } });
    },
  );

  it('passes a throw of resolveData on unchanged, without a log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mine = new Error('mine');
    answer(200, '{}');

    await expect(
      serverApi.get('/things', {
        resolveData: () => {
          throw mine;
        },
      }),
    ).rejects.toBe(mine);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('gives NETWORK without the upstream message or the request data', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed: secret-host Bearer token'));

    const error = await failureOf(
      serverApi.post('/things', { headers: { Authorization: 'Bearer token' }, body: { pw: 'x' } }),
    );

    expect(error.errorCode).toBe(API_ERROR_CODES.SERVER_API.NETWORK);
    expect(error.retryable).toBe(false);
    expect(JSON.stringify([error.message, error.stack])).not.toMatch(/secret-host|Bearer|"pw"/);
  });

  it('gives TIMEOUT when the upstream is slower than API_TIMEOUT_MS', async () => {
    fetchMock.mockImplementation((input) => {
      const { signal } = input as Request;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason as Error));
      });
    });

    const error = await failureOf(serverApi.get('/things'));

    expect(error.errorCode).toBe(API_ERROR_CODES.SERVER_API.TIMEOUT);
    expect(error.source).toBe(API_ERROR_SOURCES.CMS_API_REST);
    expect(error.retryable).toBe(true);
  });

  it('uses timeoutMs when given instead of API_TIMEOUT_MS', async () => {
    fetchMock.mockImplementation((input) => {
      const { signal } = input as Request;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason as Error));
      });
    });
    const startedAt = Date.now();

    const error = await failureOf(serverApi.get('/things', { timeoutMs: 120 }));

    expect(error.errorCode).toBe(API_ERROR_CODES.SERVER_API.TIMEOUT);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(100);
  });

  it('logs each failure once, with codes only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockRejectedValue(new TypeError('fetch failed: secret-host'));

    await failureOf(serverApi.get('/things'));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[api-error] cms-api-rest NETWORK - -');
    warn.mockRestore();
  });
});
