// @vitest-environment node
import { z } from 'zod';

import { BFF_BODY_MAX_BYTES, BFF_RATE_LIMITS } from '../../../configs/Http.constants';
import { defineBffRoute } from './BffRoute.server';

const WEB_ORIGIN = 'https://site.test';

const verifyHumanCheck = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock('../restful/Turnstile.client', () => ({ verifyHumanCheck }));

vi.mock('../../../configs/Server.env', () => ({
  getServerEnv: () => ({
    webOrigin: 'https://site.test',
    trustProxyHops: 1,
    clientIpHeader: undefined,
  }),
}));

let ipCounter = 0;
/** A fresh visitor IP per test, so the process-wide limiters never carry over. */
function freshIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

interface Init {
  method?: string;
  ip?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}

function requestOf({ method = 'POST', ip = freshIp(), headers = {}, body = '{}' }: Init = {}) {
  const hasBody = method !== 'GET';
  return new Request('https://site.test/api/v1/test', {
    method,
    headers: {
      'x-forwarded-for': ip,
      ...(hasBody && { origin: WEB_ORIGIN, 'content-type': 'application/json' }),
      ...headers,
    },
    body: hasBody ? body : null,
  });
}

const handle = vi.fn<() => Promise<Response>>(() => Promise.resolve(Response.json({ ok: true })));
const bodySchema = z.object({ name: z.string().max(10) });

function postRoute() {
  return defineBffRoute({ methods: ['POST'], bucket: 'auth', bodySchema, handle }).POST;
}

async function errorCodeOf(response: Response) {
  return ((await response.json()) as { errorCode: string }).errorCode;
}

beforeEach(() => {
  handle.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('defineBffRoute pipeline', () => {
  it('runs handle with the parsed body and the visitor IP, answer never cached', async () => {
    const ip = freshIp();
    const response = await postRoute()(requestOf({ ip, body: '{"name":"Ada"}' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ body: { name: 'Ada' }, visitorIp: ip }),
    );
  });

  it('refuses an unbound method with 405 and Allow', async () => {
    const route = defineBffRoute({ methods: ['GET'], bucket: 'read', handle });
    const response = await route.POST(requestOf());
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(handle).not.toHaveBeenCalled();
  });

  it('serves a bound GET without origin or content type', async () => {
    const route = defineBffRoute({ methods: ['GET'], bucket: 'read', handle });
    expect((await route.GET(requestOf({ method: 'GET' }))).status).toBe(200);
  });

  it.each([
    ['a missing Origin', { origin: '' }],
    ['a foreign Origin', { origin: 'https://evil.test' }],
    ['a cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
    ['a same-site fetch', { 'sec-fetch-site': 'same-site' }],
  ])('refuses %s with 403', async (_name, headers: Record<string, string>) => {
    const request = requestOf({ headers });
    if (headers.origin === '') request.headers.delete('origin');
    const response = await postRoute()(request);
    expect(response.status).toBe(403);
    expect(await errorCodeOf(response)).toBe('BFF_ORIGIN_NOT_ALLOWED');
  });

  it('accepts Sec-Fetch-Site same-origin', async () => {
    const response = await postRoute()(
      requestOf({ headers: { 'sec-fetch-site': 'same-origin' }, body: '{"name":"Ada"}' }),
    );
    expect(response.status).toBe(200);
  });

  it('refuses a body that is not JSON with 415', async () => {
    const response = await postRoute()(requestOf({ headers: { 'content-type': 'text/plain' } }));
    expect(response.status).toBe(415);
  });

  it('refuses a declared length over the cap with 413', async () => {
    const response = await postRoute()(
      requestOf({ headers: { 'content-length': String(BFF_BODY_MAX_BYTES + 1) } }),
    );
    expect(response.status).toBe(413);
  });

  it('refuses a streamed body over the cap with 413 although no length was declared', async () => {
    const big = `{"name":"${'a'.repeat(BFF_BODY_MAX_BYTES)}"}`;
    const request = requestOf({ body: big });
    request.headers.delete('content-length');
    const response = await postRoute()(request);
    expect(response.status).toBe(413);
    expect(handle).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown key', '{"name":"Ada","admin":true}'],
    ['too long', '{"name":"abcdefghijkl"}'],
    ['wrong type', '{"name":1}'],
    ['not JSON', '{name'],
  ])('refuses a body with %s with 400', async (_name, body) => {
    const response = await postRoute()(requestOf({ body }));
    expect(response.status).toBe(400);
    expect(await errorCodeOf(response)).toBe('BFF_INVALID_REQUEST');
  });

  it('accepts an empty body and refuses any key when the route has no schema', async () => {
    const route = defineBffRoute({ methods: ['POST'], bucket: 'auth', handle }).POST;
    expect((await route(requestOf({ body: '' }))).status).toBe(200);
    expect((await route(requestOf({ body: '{"x":1}' }))).status).toBe(400);
  });

  it('limits per visitor IP and bucket with 429 and Retry-After', async () => {
    const route = defineBffRoute({ methods: ['POST'], bucket: 'auth', handle }).POST;
    const ip = freshIp();
    for (let i = 0; i < BFF_RATE_LIMITS.auth.limit; i += 1) {
      expect((await route(requestOf({ ip }))).status).toBe(200);
    }
    const limited = await route(requestOf({ ip }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await route(requestOf({ ip: freshIp() }))).status).toBe(200);
  });

  it('answers a thrown error as 502 BFF_UPSTREAM_FAILED without detail', async () => {
    const route = defineBffRoute({
      methods: ['POST'],
      bucket: 'auth',
      handle: () => Promise.reject(new Error('db password=hunter2 leaked')),
    }).POST;
    const response = await route(requestOf());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain('hunter2');
  });

  it('verifies the human-check token before handle and does not pass it on', async () => {
    verifyHumanCheck.mockResolvedValue(undefined);
    const ip = freshIp();
    const route = defineBffRoute({
      methods: ['POST'],
      bucket: 'auth',
      humanCheckAction: 'login',
      bodySchema: z.object({ name: z.string(), humanCheckToken: z.string() }),
      handle,
    }).POST;
    const response = await route(requestOf({ ip, body: '{"name":"a","humanCheckToken":"tok"}' }));
    expect(response.status).toBe(200);
    expect(verifyHumanCheck).toHaveBeenCalledWith('tok', 'login', ip);
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ body: { name: 'a' } }));
  });

  it('refuses a human-check route when the verifier refuses, without calling handle', async () => {
    const { BffError } = await import('./Bff.errors');
    verifyHumanCheck.mockRejectedValue(new BffError('BFF_HUMAN_CHECK_UNAVAILABLE'));
    const route = defineBffRoute({
      methods: ['POST'],
      bucket: 'auth',
      humanCheckAction: 'login',
      handle,
    }).POST;
    const response = await route(requestOf());
    expect(response.status).toBe(503);
    expect(await errorCodeOf(response)).toBe('BFF_HUMAN_CHECK_UNAVAILABLE');
    expect(handle).not.toHaveBeenCalled();
  });

  it('logs only the route and the code of a refusal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await postRoute()(requestOf({ body: '{"name":"secret-password","extra":1}' }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.join(' ')).toBe('[bff] POST /api/v1/test BFF_INVALID_REQUEST');
  });
});
