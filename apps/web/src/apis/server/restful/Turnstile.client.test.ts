// @vitest-environment node

import { WebApiError } from '@/apis/WebApi.errors';
import { TURNSTILE } from '@/configs/Security.constants';

import { verifyHumanCheck } from './Turnstile.client';

const env = vi.hoisted(() => ({
  turnstileSecretKey: 'real-secret',
  turnstileExpectedHostname: undefined as string | undefined,
}));
vi.mock('../../../configs/Server.env', () => ({ getServerEnv: () => env }));

const fetchMock = vi.fn<typeof fetch>();

function siteverifyAnswers(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

async function errorCodeOf(promise: Promise<void>): Promise<string | undefined> {
  return promise.then(
    () => undefined,
    (error: { errorCode: string }) => error.errorCode,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  env.turnstileSecretKey = 'real-secret';
  env.turnstileExpectedHostname = undefined;
});
afterEach(() => vi.unstubAllGlobals());

describe('verifyHumanCheck', () => {
  it('posts the secret, token and visitor IP to siteverify and passes a matching action', async () => {
    siteverifyAnswers({ success: true, action: 'login', hostname: 'site.test' });

    await expect(verifyHumanCheck('tok', 'login', '203.0.113.9')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TURNSTILE.SITEVERIFY_URL);
    expect(init.redirect).toBe('manual');
    expect(JSON.parse(init.body as string)).toEqual({
      secret: 'real-secret',
      response: 'tok',
      remoteip: '203.0.113.9',
    });
  });

  it('omits remoteip when no visitor IP is trusted', async () => {
    siteverifyAnswers({ success: true, action: 'login' });
    await verifyHumanCheck('tok', 'login', undefined);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('remoteip');
  });

  it.each([undefined, '', 42, 'x'.repeat(TURNSTILE.TOKEN_MAX_LENGTH + 1)])(
    'refuses the unusable token %#',
    async (token) => {
      expect(await errorCodeOf(verifyHumanCheck(token, 'login', undefined))).toBe(
        'BFF_HUMAN_CHECK_FAILED',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('refuses an unsuccessful token', async () => {
    siteverifyAnswers({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    expect(await errorCodeOf(verifyHumanCheck('tok', 'login', undefined))).toBe(
      'BFF_HUMAN_CHECK_FAILED',
    );
  });

  it('refuses a token made for another action', async () => {
    siteverifyAnswers({ success: true, action: 'two-factor' });
    expect(await errorCodeOf(verifyHumanCheck('tok', 'login', undefined))).toBe(
      'BFF_HUMAN_CHECK_FAILED',
    );
  });

  it('refuses a missing action with a real secret', async () => {
    siteverifyAnswers({ success: true });
    expect(await errorCodeOf(verifyHumanCheck('tok', 'login', undefined))).toBe(
      'BFF_HUMAN_CHECK_FAILED',
    );
  });

  it('skips only the action check with the always-pass test secret', async () => {
    env.turnstileSecretKey = TURNSTILE.ALWAYS_PASS_TEST_SECRET;
    siteverifyAnswers({ success: true });
    await expect(verifyHumanCheck('tok', 'login', undefined)).resolves.toBeUndefined();

    siteverifyAnswers({ success: false });
    expect(await errorCodeOf(verifyHumanCheck('tok', 'login', undefined))).toBe(
      'BFF_HUMAN_CHECK_FAILED',
    );
  });

  it('still checks the hostname with the always-pass test secret', async () => {
    env.turnstileSecretKey = TURNSTILE.ALWAYS_PASS_TEST_SECRET;
    env.turnstileExpectedHostname = 'site.test';
    siteverifyAnswers({ success: true, hostname: 'example.com' });
    expect(await errorCodeOf(verifyHumanCheck('tok', 'login', undefined))).toBe(
      'BFF_HUMAN_CHECK_FAILED',
    );
  });

  it('compares the hostname when one is expected', async () => {
    env.turnstileExpectedHostname = 'site.test';
    siteverifyAnswers({ success: true, action: 'login', hostname: 'site.test' });
    await expect(verifyHumanCheck('tok', 'login', undefined)).resolves.toBeUndefined();

    siteverifyAnswers({ success: true, action: 'login', hostname: 'evil.test' });
    expect(await errorCodeOf(verifyHumanCheck('tok', 'login', undefined))).toBe(
      'BFF_HUMAN_CHECK_FAILED',
    );
  });

  it('fails closed when siteverify is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await errorCodeOf(verifyHumanCheck('tok', 'login', undefined))).toBe(
      'BFF_HUMAN_CHECK_UNAVAILABLE',
    );
  });

  it('fails closed when siteverify does not answer JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }));
    expect(await errorCodeOf(verifyHumanCheck('tok', 'login', undefined))).toBe(
      'BFF_HUMAN_CHECK_UNAVAILABLE',
    );
  });
});

describe('verifyHumanCheck failures', () => {
  it('are WebApiErrors of source turnstile', async () => {
    siteverifyAnswers({ success: false });
    const failure = await verifyHumanCheck('tok', 'login', undefined).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(WebApiError);
    expect(failure).toMatchObject({ source: 'turnstile', errorCode: 'BFF_HUMAN_CHECK_FAILED' });
  });
});
