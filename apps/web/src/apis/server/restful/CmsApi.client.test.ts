// @vitest-environment node
import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';

import { bffErrorOf } from '../bff/Bff.errors';
import { cmsApiClient } from './CmsApi.client';
import { serverApi } from './ServerApi.client';

vi.mock('../../../configs/Server.env', () => ({
  getServerEnv: () => ({
    appApiUrl: 'http://api.internal/api/v1',
    appApiOrigin: 'http://api.internal',
    webOrigin: 'https://site.test',
    clientIpHeader: 'cf-connecting-ip',
    revalidateOverrideSeconds: undefined,
  }),
}));

const fetchMock = vi.fn<typeof fetch>();
const IP = '203.0.113.9';

function answer(status: number, body?: unknown, headers: HeadersInit = {}) {
  fetchMock.mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers }),
  );
}

/** The call as it reaches `fetch` through `serverApi` (axios hands it a `Request` plus init). */
function lastCall(): { url: string; request: Request; init: RequestInit; headers: Headers } {
  const [request, init] = fetchMock.mock.calls[0] as [Request, RequestInit];
  return { url: request.url, request, init, headers: request.headers };
}

async function sentBody(): Promise<unknown> {
  return JSON.parse(await lastCall().request.text());
}

/** The code the BFF answers with for the failure the call raised. */
async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => undefined,
    (error: unknown) => bffErrorOf(error).errorCode,
  );
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((caught: unknown) => caught);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('every call', () => {
  it('goes to the internal URL without following redirects, forwarding the IP once', async () => {
    answer(200, { accessToken: 'a' });
    await cmsApiClient.logIn(
      { email: 'e', password: 'p', rememberMe: false, turnstileToken: 'tt' },
      IP,
    );

    const { url, init, headers } = lastCall();
    expect(url).toBe('http://api.internal/api/v1/auth/login');
    expect(lastCall().request.redirect).toBe('manual');
    expect(init).toMatchObject({ cache: 'no-store' });
    expect(headers.get('x-forwarded-for')).toBe(IP);
    expect(headers.get('cf-connecting-ip')).toBe(IP);
    expect(headers.has('cookie')).toBe(false);
  });

  it('sends no forwarding header when no address is trusted', async () => {
    answer(200, { accessToken: 'a' });
    await cmsApiClient.logIn(
      { email: 'e', password: 'p', rememberMe: false, turnstileToken: 'tt' },
      undefined,
    );
    expect(lastCall().headers.has('x-forwarded-for')).toBe(false);
  });

  it('maps a redirect, a 5xx, a network error and a timeout to fixed codes', async () => {
    answer(302, undefined, { location: 'http://elsewhere' });
    expect(await errorCodeOf(cmsApiClient.logOut('rt', IP))).toBe('BFF_UPSTREAM_FAILED');
    answer(503, { message: 'db password leaked' });
    expect(await errorCodeOf(cmsApiClient.logOut('rt', IP))).toBe('BFF_UPSTREAM_FAILED');
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await errorCodeOf(cmsApiClient.logOut('rt', IP))).toBe('BFF_UPSTREAM_FAILED');
  });

  it.each([
    [API_ERROR_CODES.SERVER_API.NETWORK, 'BFF_UPSTREAM_FAILED'],
    [API_ERROR_CODES.SERVER_API.TIMEOUT, 'BFF_UPSTREAM_TIMEOUT'],
    [API_ERROR_CODES.SERVER_API.REDIRECT, 'BFF_UPSTREAM_FAILED'],
    [API_ERROR_CODES.SERVER_API.INVALID_BODY, 'BFF_UPSTREAM_FAILED'],
  ])('maps the transport failure %s to %s', async (failure, mapped) => {
    vi.spyOn(serverApi, 'request').mockRejectedValue(
      new WebApiError({ source: API_ERROR_SOURCES.CMS_API_REST, errorCode: failure }),
    );
    expect(await errorCodeOf(cmsApiClient.logOut('rt', IP))).toBe(mapped);
  });

  it('sends every call through serverApi.request with its method', async () => {
    const request = vi.spyOn(serverApi, 'request');
    answer(200, { status: 'ok' });
    await cmsApiClient.readLiveHealth();
    answer(204);
    await cmsApiClient.logOut('rt', IP);
    expect(request.mock.calls.map(([method]) => method)).toEqual(['GET', 'POST']);
  });

  it('raises a cms-api-rest WebApiError for a 429 and the BFF answers with its Retry-After', async () => {
    answer(429, { message: 'x' }, { 'retry-after': '42' });
    const error = await failureOf(
      cmsApiClient.logIn(
        { email: 'e', password: 'p', rememberMe: false, turnstileToken: 'tt' },
        IP,
      ),
    );
    expect(error).toBeInstanceOf(WebApiError);
    expect(error).toMatchObject({
      source: API_ERROR_SOURCES.CMS_API_REST,
      errorCode: 'BFF_RATE_LIMITED',
      statusCode: 429,
      retryAfterSeconds: 42,
    });
    expect(bffErrorOf(error)).toMatchObject({
      errorCode: 'BFF_RATE_LIMITED',
      headers: { 'retry-after': '42' },
    });
  });

  it('keeps the cms-api errorCode of an unexpected 4xx as upstreamErrorCode', async () => {
    answer(400, { errorCode: 'AUTH_INVALID_REQUEST' });
    const error = await failureOf(
      cmsApiClient.logIn(
        { email: 'e', password: 'p', rememberMe: false, turnstileToken: 'tt' },
        IP,
      ),
    );
    expect(error).toMatchObject({
      source: API_ERROR_SOURCES.CMS_API_REST,
      statusCode: 400,
      upstreamErrorCode: 'AUTH_INVALID_REQUEST',
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
    expect(
      await cmsApiClient.logIn(
        { email: 'e', password: 'p', rememberMe: false, turnstileToken: 'tt' },
        IP,
      ),
    ).toEqual({
      kind: 'signed-in',
      accessToken: 'at',
      refreshToken: 'rt-1',
    });
  });

  it('sends rememberMe in the login body', async () => {
    answer(200, { accessToken: 'a' });
    await cmsApiClient.logIn(
      { email: 'e', password: 'p', rememberMe: true, turnstileToken: 'tt' },
      IP,
    );
    expect(await sentBody()).toEqual({
      email: 'e',
      password: 'p',
      rememberMe: true,
      turnstileToken: 'tt',
    });
  });

  it('returns the second step with only the allowlisted fields', async () => {
    answer(200, { requires2FA: true, tempToken: 't', methods: ['totp'], leak: 1 });
    expect(
      await cmsApiClient.logIn(
        { email: 'e', password: 'p', rememberMe: false, turnstileToken: 'tt' },
        IP,
      ),
    ).toEqual({
      kind: 'two-factor-required',
      tempToken: 't',
      methods: ['totp'],
    });
  });

  it('maps any 401 to invalid credentials and an odd answer to upstream failure', async () => {
    answer(401, { errorCode: 'ANYTHING' });
    expect(
      await errorCodeOf(
        cmsApiClient.logIn(
          { email: 'e', password: 'p', rememberMe: false, turnstileToken: 'tt' },
          IP,
        ),
      ),
    ).toBe('BFF_INVALID_CREDENTIALS');
    answer(200, { nothing: true });
    expect(
      await errorCodeOf(
        cmsApiClient.logIn(
          { email: 'e', password: 'p', rememberMe: false, turnstileToken: 'tt' },
          IP,
        ),
      ),
    ).toBe('BFF_UPSTREAM_FAILED');
    answer(400, { errorCode: 'AUTH_INVALID_REQUEST' });
    expect(
      await errorCodeOf(
        cmsApiClient.logIn(
          { email: 'e', password: 'p', rememberMe: false, turnstileToken: 'tt' },
          IP,
        ),
      ),
    ).toBe('BFF_UPSTREAM_FAILED');
  });
});

describe('verifyTwoFactor and sendEmailChallenge', () => {
  it('returns the issued tokens', async () => {
    answer(200, { accessToken: 'at' }, { 'set-cookie': '__Secure-abyss_rt=rt-2; Path=/' });
    expect(
      await cmsApiClient.verifyTwoFactor(
        { tempToken: 't', code: '123456', turnstileToken: 'tt' },
        IP,
      ),
    ).toEqual({
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
    expect(
      await errorCodeOf(
        cmsApiClient.verifyTwoFactor({ tempToken: 't', code: '1', turnstileToken: 'tt' }, IP),
      ),
    ).toBe(mapped);
  });

  it('sends the email challenge and expects 202', async () => {
    answer(202);
    await expect(
      cmsApiClient.sendEmailChallenge({ tempToken: 't', turnstileToken: 'tt' }, IP),
    ).resolves.toBeUndefined();
    expect(await sentBody()).toEqual({ tempToken: 't', turnstileToken: 'tt' });

    answer(401, { errorCode: 'AUTH_INVALID_TEMP_TOKEN' });
    expect(
      await errorCodeOf(
        cmsApiClient.sendEmailChallenge({ tempToken: 't', turnstileToken: 'tt' }, IP),
      ),
    ).toBe('BFF_TWO_FACTOR_EXPIRED');
  });
});

describe('human check answers of cms-api', () => {
  const credentials = { email: 'e', password: 'p', rememberMe: false, turnstileToken: 'tt' };
  const calls = [
    ['login', () => cmsApiClient.logIn(credentials, IP)],
    [
      'email challenge',
      () => cmsApiClient.sendEmailChallenge({ tempToken: 't', turnstileToken: 'tt' }, IP),
    ],
    [
      'verify',
      () => cmsApiClient.verifyTwoFactor({ tempToken: 't', code: '1', turnstileToken: 'tt' }, IP),
    ],
  ] as const;

  it.each(calls)(
    'maps 400 HUMAN_CHECK_FAILED of %s to BFF_HUMAN_CHECK_FAILED',
    async (_name, call) => {
      answer(400, { errorCode: 'HUMAN_CHECK_FAILED' });
      expect(await errorCodeOf(call())).toBe('BFF_HUMAN_CHECK_FAILED');
    },
  );

  it.each(calls)(
    'maps 503 HUMAN_CHECK_UNAVAILABLE of %s to BFF_HUMAN_CHECK_UNAVAILABLE',
    async (_name, call) => {
      answer(503, { errorCode: 'HUMAN_CHECK_UNAVAILABLE' });
      expect(await errorCodeOf(call())).toBe('BFF_HUMAN_CHECK_UNAVAILABLE');
    },
  );

  it('keeps any other 400 or 503 an upstream failure', async () => {
    answer(400, { errorCode: 'AUTH_INVALID_REQUEST' });
    expect(await errorCodeOf(cmsApiClient.logIn(credentials, IP))).toBe('BFF_UPSTREAM_FAILED');
    answer(503, { errorCode: 'SOMETHING_ELSE' });
    expect(await errorCodeOf(cmsApiClient.logIn(credentials, IP))).toBe('BFF_UPSTREAM_FAILED');
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
    expect(lastCall().url).toBe('http://api.internal/health/live');
    answer(200, { status: 'degraded' });
    expect(await cmsApiClient.readLiveHealth()).toBe(false);
    answer(503, {});
    expect(await cmsApiClient.readLiveHealth()).toBe(false);
    fetchMock.mockRejectedValue(new TypeError('down'));
    expect(await cmsApiClient.readLiveHealth()).toBe(false);
  });
});
