// @vitest-environment node

import { BffError } from '@/apis/server/bff/Bff.errors';
import { BffContext } from '@/apis/server/bff/BffRoute.server';

import {
  readTwoFactorCookie,
  writeSessionCookie,
  writeTwoFactorCookie,
} from './SealedCookie.server';
import {
  emailCodeBodySchema,
  loginBodySchema,
  logInVisitor,
  logOutVisitor,
  sendTwoFactorEmailCode,
  verifyBodySchema,
  verifyTwoFactorCode,
} from './SignIn.server';

vi.mock('../../configs/Server.env', () => ({
  getServerEnv: () => ({ sessionSecret: 'a'.repeat(32) }),
}));
const client = vi.hoisted(() => ({
  logIn: vi.fn<() => Promise<unknown>>(),
  verifyTwoFactor: vi.fn<() => Promise<unknown>>(),
  sendEmailChallenge: vi.fn<() => Promise<void>>(),
  readCurrentAccount: vi.fn<() => Promise<unknown>>(),
  logOut: vi.fn<() => Promise<void>>(),
}));
vi.mock('../../apis/server/restful/CmsApi.client', () => ({ cmsApiClient: client }));

const IP = '203.0.113.9';
const READER = {
  id: '1',
  email: 'a@b.c',
  displayName: 'A',
  role: 'reader',
  permissions: ['cv:read'],
  passwordHash: 'must-not-leak',
};
const ACCESS = `h.${Buffer.from(JSON.stringify({ exp: 4_000_000_000 })).toString('base64url')}.s`;
const ISSUED = { accessToken: ACCESS, refreshToken: 'rt-1' };

function context<T>(body: T, cookie?: string): BffContext<T> {
  const headers = cookie === undefined ? {} : { cookie: cookie.split(';')[0]! };
  return { request: new Request('https://site.test/api/v1', { headers }), body, visitorIp: IP };
}

function cookieNames(response: Response): string[] {
  return response.headers.getSetCookie().map((line) => line.split('=')[0]!);
}

async function refusalOf(promise: Promise<unknown>): Promise<BffError> {
  const error: unknown = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(BffError);
  return error as BffError;
}

beforeEach(() => {
  vi.resetAllMocks();
  client.logOut.mockResolvedValue(undefined);
  client.sendEmailChallenge.mockResolvedValue(undefined);
});

describe('body schemas', () => {
  it('require the human-check token and refuse unknown keys through strict', () => {
    expect(loginBodySchema.safeParse({ email: 'a@b.c', password: 'x' }).success).toBe(false);
    expect(emailCodeBodySchema.safeParse({ humanCheckToken: 't' }).success).toBe(true);
    expect(verifyBodySchema.safeParse({ code: '1'.repeat(13), humanCheckToken: 't' }).success).toBe(
      false,
    );
  });

  it('login takes an optional boolean rememberMe, absent reads false, other types refused', () => {
    const base = { email: 'a@b.c', password: 'x', humanCheckToken: 't' };
    expect(loginBodySchema.parse(base).rememberMe).toBe(false);
    expect(loginBodySchema.parse({ ...base, rememberMe: true }).rememberMe).toBe(true);
    expect(loginBodySchema.safeParse({ ...base, rememberMe: 'true' }).success).toBe(false);
    expect(loginBodySchema.strict().safeParse({ ...base, extra: 1 }).success).toBe(false);
  });

  it('verify refuses a rememberMe key as unknown', () => {
    const body = { code: '123456', humanCheckToken: 't' };
    expect(verifyBodySchema.strict().safeParse(body).success).toBe(true);
    expect(verifyBodySchema.strict().safeParse({ ...body, rememberMe: true }).success).toBe(false);
  });
});

describe('logInVisitor', () => {
  const body = { email: 'a@b.c', password: 'pw', rememberMe: false };

  it('seals the session, clears the 2FA cookie and returns only allowlisted user fields', async () => {
    client.logIn.mockResolvedValue({ kind: 'signed-in', ...ISSUED });
    client.readCurrentAccount.mockResolvedValue(READER);
    const response = await logInVisitor(context(body));
    expect(await response.json()).toEqual({
      status: 'signed-in',
      user: { id: '1', email: 'a@b.c', displayName: 'A', role: 'reader' },
    });
    expect(cookieNames(response)).toEqual(['__Host-abyss_web_session', '__Host-abyss_web_2fa']);
    expect(response.headers.getSetCookie()[0]).not.toContain('rt-1');
  });

  it.each([true, false])(
    'passes rememberMe=%s to cms-api and sets the session cookie in that mode',
    async (rememberMe) => {
      client.logIn.mockResolvedValue({ kind: 'signed-in', ...ISSUED });
      client.readCurrentAccount.mockResolvedValue(READER);
      const response = await logInVisitor(context({ ...body, rememberMe }));
      expect(client.logIn).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw', rememberMe }, IP);
      expect(response.headers.getSetCookie()[0]).toMatch(
        rememberMe ? /Max-Age=2592000$/ : /^(?!.*Max-Age)/,
      );
    },
  );

  it('keeps rememberMe in the 2FA cookie', async () => {
    client.logIn.mockResolvedValue({ kind: 'two-factor-required', tempToken: 'tmp', methods: [] });
    const response = await logInVisitor(context({ ...body, rememberMe: true }));
    const request = new Request('https://site.test/', {
      headers: { cookie: response.headers.getSetCookie()[0]!.split(';')[0]! },
    });
    expect(readTwoFactorCookie(request).value?.rememberMe).toBe(true);
  });

  it('answers two-factor-required with the 2FA cookie only, and drops unknown methods', async () => {
    client.logIn.mockResolvedValue({
      kind: 'two-factor-required',
      tempToken: 'tmp',
      methods: ['totp', 'sms'],
    });
    const response = await logInVisitor(context(body));
    expect(await response.json()).toEqual({ status: 'two-factor-required', methods: ['totp'] });
    expect(cookieNames(response)).toEqual(['__Host-abyss_web_2fa']);
    expect(client.readCurrentAccount).not.toHaveBeenCalled();
  });

  it('logs a privileged account out and refuses with both cookies cleared', async () => {
    client.logIn.mockResolvedValue({ kind: 'signed-in', ...ISSUED });
    client.readCurrentAccount.mockResolvedValue({ ...READER, permissions: ['post:update'] });
    const error = await refusalOf(logInVisitor(context(body)));
    expect(error.errorCode).toBe('BFF_PRIVILEGED_ACCOUNT');
    expect(error.setCookies).toHaveLength(2);
    expect(error.setCookies.every((line) => line.includes('Max-Age=0'))).toBe(true);
    expect(client.logOut).toHaveBeenCalledWith('rt-1', IP);
  });

  it('is an upstream failure when cms-api sets no refresh token', async () => {
    client.logIn.mockResolvedValue({ kind: 'signed-in', accessToken: ACCESS });
    expect((await refusalOf(logInVisitor(context(body)))).errorCode).toBe('BFF_UPSTREAM_FAILED');
  });
});

describe('two-factor routes', () => {
  const challenge = writeTwoFactorCookie({
    tempToken: 'tmp',
    methods: ['email'],
    rememberMe: false,
  });

  it('email-code answers 202 using the cookie temp token', async () => {
    const response = await sendTwoFactorEmailCode(context({}, challenge));
    expect(response.status).toBe(202);
    expect(client.sendEmailChallenge).toHaveBeenCalledWith('tmp', IP);
  });

  it('both steps refuse without a 2FA cookie', async () => {
    const error = await refusalOf(sendTwoFactorEmailCode(context({})));
    expect(error.errorCode).toBe('BFF_TWO_FACTOR_EXPIRED');
    expect(error.setCookies).toEqual([]);
    const verify = await refusalOf(verifyTwoFactorCode(context({ code: '123456' })));
    expect(verify.errorCode).toBe('BFF_TWO_FACTOR_EXPIRED');
  });

  it('an unreadable 2FA cookie is cleared', async () => {
    const request = new Request('https://site.test/', {
      headers: { cookie: '__Host-abyss_web_2fa=garbage' },
    });
    expect(readTwoFactorCookie(request).isPresent).toBe(true);
    const error = await refusalOf(sendTwoFactorEmailCode({ request, body: {}, visitorIp: IP }));
    expect(error.setCookies).toHaveLength(1);
  });

  it('verify seals the session and clears the 2FA cookie', async () => {
    client.verifyTwoFactor.mockResolvedValue(ISSUED);
    client.readCurrentAccount.mockResolvedValue(READER);
    const response = await verifyTwoFactorCode(context({ code: '123456' }, challenge));
    expect(client.verifyTwoFactor).toHaveBeenCalledWith({ tempToken: 'tmp', code: '123456' }, IP);
    expect(await response.json()).toEqual({
      user: { id: '1', email: 'a@b.c', displayName: 'A', role: 'reader' },
    });
    expect(cookieNames(response)).toEqual(['__Host-abyss_web_session', '__Host-abyss_web_2fa']);
  });

  it.each([true, false])(
    'verify takes rememberMe=%s from the challenge cookie',
    async (rememberMe) => {
      client.verifyTwoFactor.mockResolvedValue(ISSUED);
      client.readCurrentAccount.mockResolvedValue(READER);
      const sealed = writeTwoFactorCookie({ tempToken: 'tmp', methods: ['email'], rememberMe });
      const response = await verifyTwoFactorCode(context({ code: '123456' }, sealed));
      expect(response.headers.getSetCookie()[0]).toMatch(
        rememberMe ? /Max-Age=2592000$/ : /^(?!.*Max-Age)/,
      );
    },
  );

  it('a wrong code keeps the challenge cookie; an expired temp token clears it', async () => {
    client.verifyTwoFactor.mockRejectedValueOnce(new BffError('BFF_INVALID_TWO_FACTOR_CODE'));
    const wrong = await refusalOf(verifyTwoFactorCode(context({ code: '1' }, challenge)));
    expect(wrong.setCookies).toEqual([]);
    client.verifyTwoFactor.mockRejectedValueOnce(new BffError('BFF_TWO_FACTOR_EXPIRED'));
    const expired = await refusalOf(verifyTwoFactorCode(context({ code: '1' }, challenge)));
    expect(expired.errorCode).toBe('BFF_TWO_FACTOR_EXPIRED');
    expect(expired.setCookies).toHaveLength(1);
  });

  it('verify refuses a privileged account', async () => {
    client.verifyTwoFactor.mockResolvedValue(ISSUED);
    client.readCurrentAccount.mockResolvedValue({ ...READER, permissions: ['user:manage'] });
    const error = await refusalOf(verifyTwoFactorCode(context({ code: '1' }, challenge)));
    expect(error.errorCode).toBe('BFF_PRIVILEGED_ACCOUNT');
  });
});

describe('logOutVisitor', () => {
  const session = writeSessionCookie({
    refreshToken: 'rt-1',
    accessToken: ACCESS,
    accessExpiresAt: 4_000_000_000_000,
    rememberMe: false,
  });

  it('logs out at cms-api and clears both cookies with 204', async () => {
    const response = await logOutVisitor(context({}, session));
    expect(response.status).toBe(204);
    expect(client.logOut).toHaveBeenCalledWith('rt-1', IP);
    expect(response.headers.getSetCookie().every((line) => line.includes('Max-Age=0'))).toBe(true);
    expect(cookieNames(response)).toHaveLength(2);
  });

  it('clears both cookies even when cms-api fails or there is no session', async () => {
    client.logOut.mockRejectedValue(new BffError('BFF_UPSTREAM_FAILED'));
    expect((await logOutVisitor(context({}, session))).headers.getSetCookie()).toHaveLength(2);
    client.logOut.mockClear();
    const response = await logOutVisitor(context({}));
    expect(response.status).toBe(204);
    expect(client.logOut).not.toHaveBeenCalled();
  });
});
