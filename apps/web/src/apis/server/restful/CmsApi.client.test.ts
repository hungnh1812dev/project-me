// @vitest-environment node
import { cmsApiClient } from './CmsApi.client';

vi.mock('../../../configs/Server.env', () => ({
  getServerEnv: () => ({
    apiInternalUrl: 'http://api.internal/api/v1',
    webOrigin: 'https://site.test',
    clientIpHeader: 'cf-connecting-ip',
  }),
}));

const fetchMock = vi.fn<typeof fetch>();
const IP = '203.0.113.9';

function answer(status: number, body?: unknown, headers: HeadersInit = {}) {
  fetchMock.mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers }),
  );
}

function lastCall(): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => undefined,
    (error: { errorCode: string }) => error.errorCode,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('every call', () => {
  it('goes to the internal URL without following redirects, forwarding the IP once', async () => {
    answer(200, { accessToken: 'a' });
    await cmsApiClient.logIn({ email: 'e', password: 'p' }, IP);

    const { url, init, headers } = lastCall();
    expect(url).toBe('http://api.internal/api/v1/auth/login');
    expect(init.redirect).toBe('manual');
    expect(headers.get('x-forwarded-for')).toBe(IP);
    expect(headers.get('cf-connecting-ip')).toBe(IP);
    expect(headers.has('cookie')).toBe(false);
  });

  it('sends no forwarding header when no address is trusted', async () => {
    answer(200, { accessToken: 'a' });
    await cmsApiClient.logIn({ email: 'e', password: 'p' }, undefined);
    expect(lastCall().headers.has('x-forwarded-for')).toBe(false);
  });

  it('maps a redirect, a 5xx, a network error and a timeout to fixed codes', async () => {
    answer(302, undefined, { location: 'http://elsewhere' });
    expect(await errorCodeOf(cmsApiClient.logOut('rt', IP))).toBe('BFF_UPSTREAM_FAILED');
    answer(503, { message: 'db password leaked' });
    expect(await errorCodeOf(cmsApiClient.logOut('rt', IP))).toBe('BFF_UPSTREAM_FAILED');
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await errorCodeOf(cmsApiClient.logOut('rt', IP))).toBe('BFF_UPSTREAM_FAILED');
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    expect(await errorCodeOf(cmsApiClient.logOut('rt', IP))).toBe('BFF_UPSTREAM_TIMEOUT');
  });

  it('keeps the Retry-After of a cms-api 429', async () => {
    answer(429, { message: 'x' }, { 'retry-after': '42' });
    const error: unknown = await cmsApiClient
      .logIn({ email: 'e', password: 'p' }, IP)
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      errorCode: 'BFF_RATE_LIMITED',
      headers: { 'retry-after': '42' },
    });
  });
});

describe('a token that is not a valid header value', () => {
  it('is a fixed upstream failure and never reaches cms-api', async () => {
    expect(await errorCodeOf(cmsApiClient.refreshSession('bad\r\nvalue', IP))).toBe(
      'BFF_UPSTREAM_FAILED',
    );
    expect(await errorCodeOf(cmsApiClient.readCurrentAccount('bad\r\nvalue', IP))).toBe(
      'BFF_UPSTREAM_FAILED',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('logIn', () => {
  it('returns the access token and the refresh token from Set-Cookie by name only', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'at', extra: 'dropped' }), {
        status: 200,
        headers: [
          ['set-cookie', 'other=1; Path=/'],
          ['set-cookie', '__Secure-abyss_rt=rt-1; Max-Age=900; HttpOnly; Secure'],
        ],
      }),
    );
    expect(await cmsApiClient.logIn({ email: 'e', password: 'p' }, IP)).toEqual({
      kind: 'signed-in',
      accessToken: 'at',
      refreshToken: 'rt-1',
    });
  });

  it('returns the second step with only the allowlisted fields', async () => {
    answer(200, { requires2FA: true, tempToken: 't', methods: ['totp'], leak: 1 });
    expect(await cmsApiClient.logIn({ email: 'e', password: 'p' }, IP)).toEqual({
      kind: 'two-factor-required',
      tempToken: 't',
      methods: ['totp'],
    });
  });

  it('maps any 401 to invalid credentials and an odd answer to upstream failure', async () => {
    answer(401, { errorCode: 'ANYTHING' });
    expect(await errorCodeOf(cmsApiClient.logIn({ email: 'e', password: 'p' }, IP))).toBe(
      'BFF_INVALID_CREDENTIALS',
    );
    answer(200, { nothing: true });
    expect(await errorCodeOf(cmsApiClient.logIn({ email: 'e', password: 'p' }, IP))).toBe(
      'BFF_UPSTREAM_FAILED',
    );
    answer(400, { errorCode: 'AUTH_INVALID_REQUEST' });
    expect(await errorCodeOf(cmsApiClient.logIn({ email: 'e', password: 'p' }, IP))).toBe(
      'BFF_UPSTREAM_FAILED',
    );
  });
});

describe('verifyTwoFactor and sendEmailChallenge', () => {
  it('returns the issued tokens', async () => {
    answer(200, { accessToken: 'at' }, { 'set-cookie': '__Secure-abyss_rt=rt-2; Path=/' });
    expect(await cmsApiClient.verifyTwoFactor({ tempToken: 't', code: '123456' }, IP)).toEqual({
      accessToken: 'at',
      refreshToken: 'rt-2',
    });
  });

  it.each([
    ['AUTH_INVALID_2FA_CODE', 'BFF_INVALID_TWO_FACTOR_CODE'],
    ['AUTH_INVALID_TEMP_TOKEN', 'BFF_TWO_FACTOR_EXPIRED'],
    ['SOMETHING_ELSE', 'BFF_UPSTREAM_FAILED'],
  ])('maps the 401 code %s to %s', async (upstream, mapped) => {
    answer(401, { errorCode: upstream });
    expect(await errorCodeOf(cmsApiClient.verifyTwoFactor({ tempToken: 't', code: '1' }, IP))).toBe(
      mapped,
    );
  });

  it('sends the email challenge and expects 202', async () => {
    answer(202);
    await expect(cmsApiClient.sendEmailChallenge('t', IP)).resolves.toBeUndefined();
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ tempToken: 't' });

    answer(401, { errorCode: 'AUTH_INVALID_TEMP_TOKEN' });
    expect(await errorCodeOf(cmsApiClient.sendEmailChallenge('t', IP))).toBe(
      'BFF_TWO_FACTOR_EXPIRED',
    );
  });
});

describe('refreshSession and logOut', () => {
  it('sends the refresh cookie and Origin, and returns no new token during grace', async () => {
    answer(200, { accessToken: 'at2' });
    expect(await cmsApiClient.refreshSession('rt-1', IP)).toEqual({
      accessToken: 'at2',
      refreshToken: undefined,
    });
    const { headers } = lastCall();
    expect(headers.get('cookie')).toBe('__Secure-abyss_rt=rt-1');
    expect(headers.get('origin')).toBe('https://site.test');
  });

  it('returns null when the refresh token is refused', async () => {
    answer(401, { errorCode: 'AUTH_INVALID_REFRESH_TOKEN' });
    expect(await cmsApiClient.refreshSession('rt-1', IP)).toBeNull();
  });

  it('logs out with the cookie and Origin and expects 204', async () => {
    answer(204);
    await cmsApiClient.logOut('rt-1', IP);
    expect(lastCall().headers.get('cookie')).toBe('__Secure-abyss_rt=rt-1');
    answer(200, {});
    expect(await errorCodeOf(cmsApiClient.logOut('rt-1', IP))).toBe('BFF_UPSTREAM_FAILED');
  });
});

describe('readCurrentAccount', () => {
  it('sends the Bearer token and keeps only the allowlisted fields', async () => {
    answer(200, {
      id: '1',
      email: 'a@b.c',
      displayName: 'A',
      role: 'reader',
      permissions: ['article:read'],
      totpSecret: 'dropped',
    });
    expect(await cmsApiClient.readCurrentAccount('at', IP)).toEqual({
      id: '1',
      email: 'a@b.c',
      displayName: 'A',
      role: 'reader',
      permissions: ['article:read'],
    });
    expect(lastCall().headers.get('authorization')).toBe('Bearer at');
  });

  it('returns null on 401 and fails on a malformed answer', async () => {
    answer(401, {});
    expect(await cmsApiClient.readCurrentAccount('at', IP)).toBeNull();
    answer(200, { id: '1' });
    expect(await errorCodeOf(cmsApiClient.readCurrentAccount('at', IP))).toBe(
      'BFF_UPSTREAM_FAILED',
    );
  });
});

describe('readLiveHealth', () => {
  it('is true only for an ok answer', async () => {
    answer(200, { status: 'ok' });
    expect(await cmsApiClient.readLiveHealth()).toBe(true);
    expect(lastCall().url).toBe('http://api.internal/api/v1/health/live');
    answer(200, { status: 'degraded' });
    expect(await cmsApiClient.readLiveHealth()).toBe(false);
    answer(503, {});
    expect(await cmsApiClient.readLiveHealth()).toBe(false);
    fetchMock.mockRejectedValue(new TypeError('down'));
    expect(await cmsApiClient.readLiveHealth()).toBe(false);
  });
});
