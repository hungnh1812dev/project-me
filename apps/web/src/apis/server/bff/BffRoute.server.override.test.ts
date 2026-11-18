// @vitest-environment node
import { BFF_RATE_LIMITS } from '../../../configs/Http.constants';
import { defineBffRoute } from './BffRoute.server';

const OVERRIDDEN_AUTH_LIMIT = BFF_RATE_LIMITS.auth.limit + 5;
const VISITOR_IP = '198.51.100.200';

vi.mock('../../../configs/Server.env', () => ({
  getServerEnv: () => ({
    webOrigin: 'https://site.test',
    trustProxyHops: 1,
    clientIpHeader: undefined,
    bffRateLimitOverrides: { auth: OVERRIDDEN_AUTH_LIMIT },
  }),
}));

const handle = vi.fn<() => Promise<Response>>(() => Promise.resolve(Response.json({ ok: true })));

function requestOf(method: 'GET' | 'POST') {
  const isPost = method === 'POST';
  return new Request('https://site.test/api/v1/test', {
    method,
    headers: {
      'x-forwarded-for': VISITOR_IP,
      ...(isPost && { origin: 'https://site.test', 'content-type': 'application/json' }),
    },
    body: isPost ? '{}' : null,
  });
}

describe('defineBffRoute with a rate limit override', () => {
  it('raises the auth limit and leaves the read bucket on its own limit', async () => {
    const authRoute = defineBffRoute({ methods: ['POST'], bucket: 'auth', handle }).POST;
    const readRoute = defineBffRoute({ methods: ['GET'], bucket: 'read', handle }).GET;
    for (let i = 0; i < OVERRIDDEN_AUTH_LIMIT; i += 1) {
      expect((await authRoute(requestOf('POST'))).status).toBe(200);
    }
    expect((await authRoute(requestOf('POST'))).status).toBe(429);
    for (let i = 0; i < BFF_RATE_LIMITS.read.limit; i += 1) {
      expect((await readRoute(requestOf('GET'))).status).toBe(200);
    }
    expect((await readRoute(requestOf('GET'))).status).toBe(429);
  });
});
