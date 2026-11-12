// @vitest-environment node
import { writeSessionCookie } from './SealedCookie.server';
import {
  accessExpiryOf,
  answerSessionRead,
  isPrivilegedAccount,
  readWebSession,
} from './WebSession.server';

vi.mock('../../configs/Server.env', () => ({
  getServerEnv: () => ({
    sessionSecret: 'a'.repeat(32),
    trustProxyHops: 1,
    clientIpHeader: undefined,
  }),
}));
const client = vi.hoisted(() => ({
  refreshSession: vi.fn<() => Promise<unknown>>(),
  readCurrentAccount: vi.fn<() => Promise<unknown>>(),
  logOut: vi.fn<() => Promise<void>>(),
}));
vi.mock('../../apis/server/restful/CmsApi.client', () => ({ cmsApiClient: client }));
const NOW = Date.UTC(2026, 10, 5, 12);
const READER = {
  id: '1',
  email: 'a@b.c',
  displayName: 'A',
  role: 'reader',
  permissions: ['cv:read'],
};

function jwt(expSeconds: number): string {
  return `h.${Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url')}.s`;
}

function requestFor(accessExpiresAt: number, refreshToken = 'rt-1', rememberMe = false): Request {
  const line = writeSessionCookie({
    refreshToken,
    accessToken: 'old-access',
    accessExpiresAt,
    rememberMe,
  });
  return new Request('https://site.test/api/v1/session', {
    headers: { cookie: line.split(';')[0]!, 'x-forwarded-for': '203.0.113.9' },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.resetAllMocks();
});
afterEach(() => vi.useRealTimers());

describe('accessExpiryOf / isPrivilegedAccount', () => {
  it('reads exp in ms or null', () => {
    expect(accessExpiryOf(jwt(100))).toBe(100_000);
    expect(accessExpiryOf('nope')).toBeNull();
    expect(accessExpiryOf('h.e30.s')).toBeNull();
  });

  it('flags any non-read action', () => {
    expect(isPrivilegedAccount(READER)).toBe(false);
    expect(isPrivilegedAccount({ ...READER, permissions: ['cv:read', 'post:update'] })).toBe(true);
  });
});

describe('readWebSession', () => {
  it('is signed out without a cookie, and clears nothing', async () => {
    expect(await readWebSession(new Request('https://site.test/'))).toEqual({
      status: 'signed-out',
      setCookies: [],
    });
  });

  it('clears an unreadable cookie', async () => {
    const request = new Request('https://site.test/', {
      headers: { cookie: '__Host-abyss_web_session=junk' },
    });
    const read = await readWebSession(request);
    expect(read.status).toBe('signed-out');
    expect(read.setCookies[0]).toMatch(/Max-Age=0/);
  });

  it('reads the account without refreshing while the token is fresh', async () => {
    client.readCurrentAccount.mockResolvedValue(READER);
    const read = await readWebSession(requestFor(NOW + 31_000));
    expect(client.refreshSession).not.toHaveBeenCalled();
    expect(client.readCurrentAccount).toHaveBeenCalledWith('old-access', '203.0.113.9');
    expect(read).toEqual({
      status: 'signed-in',
      account: READER,
      accessToken: 'old-access',
      setCookies: [],
    });
  });

  it('refreshes under 30 s, rewrites the cookie and keeps the old refresh token when none is issued', async () => {
    const access = jwt(NOW / 1000 + 900);
    client.refreshSession.mockResolvedValue({ accessToken: access, refreshToken: undefined });
    client.readCurrentAccount.mockResolvedValue(READER);
    const read = await readWebSession(requestFor(NOW + 29_000, 'rt-due'));
    expect(client.readCurrentAccount).toHaveBeenCalledWith(access, '203.0.113.9');
    expect(read.setCookies).toHaveLength(1);
    expect(read.setCookies[0]).toMatch(/^__Host-abyss_web_session=/);
  });

  it.each([true, false])('keeps rememberMe=%s across a refresh', async (rememberMe) => {
    client.refreshSession.mockResolvedValue({
      accessToken: jwt(2_000_000_000),
      refreshToken: 'rt-2',
    });
    client.readCurrentAccount.mockResolvedValue(READER);
    const read = await readWebSession(requestFor(NOW + 1000, `rt-${rememberMe}`, rememberMe));
    expect(read.setCookies[0]).toMatch(rememberMe ? /Max-Age=2592000$/ : /^(?!.*Max-Age)/);
  });

  it('shares one refresh between concurrent reads and for 10 s after it settles', async () => {
    client.refreshSession.mockResolvedValue({
      accessToken: jwt(NOW / 1000 + 900),
      refreshToken: 'rt-2',
    });
    client.readCurrentAccount.mockResolvedValue(READER);
    await Promise.all([
      readWebSession(requestFor(NOW, 'rt-share')),
      readWebSession(requestFor(NOW, 'rt-share')),
    ]);
    expect(client.refreshSession).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 9_000);
    await readWebSession(requestFor(NOW, 'rt-share'));
    expect(client.refreshSession).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 10_001);
    await readWebSession(requestFor(NOW, 'rt-share'));
    expect(client.refreshSession).toHaveBeenCalledTimes(2);
  });

  it('clears the cookie when the refresh is refused', async () => {
    client.refreshSession.mockResolvedValue(null);
    const read = await readWebSession(requestFor(NOW, 'rt-refused'));
    expect(read.status).toBe('signed-out');
    expect(read.setCookies[0]).toMatch(/Max-Age=0/);
    expect(client.readCurrentAccount).not.toHaveBeenCalled();
  });

  it('does not share a failed refresh', async () => {
    client.refreshSession.mockRejectedValueOnce(new Error('down'));
    await expect(readWebSession(requestFor(NOW, 'rt-fail'))).rejects.toThrow('down');
    client.refreshSession.mockResolvedValue(null);
    await readWebSession(requestFor(NOW, 'rt-fail'));
    expect(client.refreshSession).toHaveBeenCalledTimes(2);
  });

  it('treats an access token with no readable exp as an upstream failure', async () => {
    client.refreshSession.mockResolvedValue({ accessToken: 'opaque', refreshToken: undefined });
    await expect(readWebSession(requestFor(NOW, 'rt-opaque'))).rejects.toMatchObject({
      errorCode: 'BFF_UPSTREAM_FAILED',
    });
  });

  it('reads signed out and clears the cookie when cms-api refuses the access token', async () => {
    client.readCurrentAccount.mockResolvedValue(null);
    const read = await readWebSession(requestFor(NOW + 60_000));
    expect(read.status).toBe('signed-out');
    expect(read.setCookies[0]).toMatch(/Max-Age=0/);
  });

  it('logs a privileged account out, clears both cookies and refuses', async () => {
    client.readCurrentAccount.mockResolvedValue({ ...READER, permissions: ['post:update'] });
    client.logOut.mockResolvedValue(undefined);
    const error = await readWebSession(requestFor(NOW + 60_000)).catch((e: unknown) => e);
    expect(error).toMatchObject({ errorCode: 'BFF_PRIVILEGED_ACCOUNT', statusCode: 403 });
    expect(client.logOut).toHaveBeenCalledWith('rt-1', '203.0.113.9');
    expect((error as { setCookies: string[] }).setCookies).toHaveLength(2);
  });

  it('still refuses when the logout at cms-api fails', async () => {
    client.readCurrentAccount.mockResolvedValue({ ...READER, permissions: ['post:update'] });
    client.logOut.mockRejectedValue(new Error('down'));
    await expect(readWebSession(requestFor(NOW + 60_000))).rejects.toMatchObject({
      errorCode: 'BFF_PRIVILEGED_ACCOUNT',
    });
  });
});

describe('answerSessionRead', () => {
  it('answers a null user for a signed-out visitor and the allowlisted fields otherwise', async () => {
    const signedOut = await answerSessionRead({
      request: new Request('https://site.test/'),
      body: {},
      visitorIp: undefined,
    });
    expect(await signedOut.json()).toEqual({ user: null });

    client.readCurrentAccount.mockResolvedValue({ ...READER, passwordHash: 'x' });
    const signedIn = await answerSessionRead({
      request: requestFor(NOW + 600_000),
      body: {},
      visitorIp: undefined,
    });
    expect(await signedIn.json()).toEqual({
      user: { id: '1', email: 'a@b.c', displayName: 'A', role: 'reader' },
    });
  });
});
