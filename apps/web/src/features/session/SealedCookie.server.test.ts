// @vitest-environment node
import {
  clearSessionCookie,
  clearTwoFactorCookie,
  openCookieValue,
  readSessionCookie,
  readTwoFactorCookie,
  sealCookieValue,
  writeSessionCookie,
  writeTwoFactorCookie,
} from './SealedCookie.server';

const env = { sessionSecret: 'a'.repeat(32) };
vi.mock('../../configs/Server.env', () => ({ getServerEnv: () => env }));

const SESSION = { refreshToken: 'r', accessToken: 'a', accessExpiresAt: 5, rememberMe: false };

function requestWith(cookie: string): Request {
  return new Request('https://site.test/', { headers: { cookie } });
}

function valueOf(line: string): string {
  return line.split(';')[0]!.split('=')[1]!;
}

describe('sealCookieValue / openCookieValue', () => {
  it('round-trips a value', () => {
    expect(openCookieValue('n', sealCookieValue('n', { a: 1 }))).toEqual({ a: 1 });
  });

  it('uses a fresh IV per seal', () => {
    expect(sealCookieValue('n', 1)).not.toBe(sealCookieValue('n', 1));
  });

  it('does not open under another cookie name', () => {
    expect(openCookieValue('other', sealCookieValue('n', 1))).toBeNull();
  });

  it('does not open under another secret', () => {
    const sealed = sealCookieValue('n', 1);
    env.sessionSecret = 'b'.repeat(32);
    expect(openCookieValue('n', sealed)).toBeNull();
    env.sessionSecret = 'a'.repeat(32);
  });

  it('returns null for tampering, a wrong version, truncation and garbage', () => {
    const sealed = sealCookieValue('n', 1);
    const bytes = Buffer.from(sealed, 'base64url');
    const flipped = Buffer.from(bytes);
    flipped[flipped.length - 1] = (flipped.at(-1) ?? 0) ^ 1;
    const otherVersion = Buffer.from(bytes);
    otherVersion[0] = 9;
    expect(openCookieValue('n', flipped.toString('base64url'))).toBeNull();
    expect(openCookieValue('n', otherVersion.toString('base64url'))).toBeNull();
    expect(openCookieValue('n', bytes.subarray(0, 10).toString('base64url'))).toBeNull();
    expect(openCookieValue('n', '!!not base64!!')).toBeNull();
    expect(openCookieValue('n', '')).toBeNull();
  });
});

describe('cookie writers', () => {
  it('writes the session cookie as a browser-session __Host- cookie', () => {
    const line = writeSessionCookie(SESSION);
    expect(line).toMatch(
      /^__Host-abyss_web_session=[\w-]+; HttpOnly; Secure; SameSite=Strict; Path=\/$/,
    );
    expect(line).not.toMatch(/Max-Age|Expires|Domain/i);
  });

  it('writes a persistent 30-day session cookie only when remembered', () => {
    expect(writeSessionCookie({ ...SESSION, rememberMe: true })).toMatch(
      /^__Host-abyss_web_session=[\w-]+; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=2592000$/,
    );
  });

  it('reads a sealed session without rememberMe as false', () => {
    const { rememberMe: _omitted, ...legacy } = SESSION;
    const sealed = sealCookieValue('__Host-abyss_web_session', legacy);
    expect(readSessionCookie(requestWith(`__Host-abyss_web_session=${sealed}`)).value).toEqual(
      SESSION,
    );
  });

  it('writes the 2FA cookie with Max-Age 300', () => {
    const line = writeTwoFactorCookie({ tempToken: 't', methods: ['totp'], rememberMe: false });
    expect(line).toMatch(
      /^__Host-abyss_web_2fa=[\w-]+; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=300$/,
    );
  });

  it('clears each cookie with Max-Age 0 and the same attributes', () => {
    expect(clearSessionCookie()).toBe(
      '__Host-abyss_web_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    );
    expect(clearTwoFactorCookie()).toBe(
      '__Host-abyss_web_2fa=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    );
  });
});

describe('cookie readers', () => {
  it('reads what the writers wrote', () => {
    const cookie = `x=1; __Host-abyss_web_session=${valueOf(writeSessionCookie(SESSION))}`;
    expect(readSessionCookie(requestWith(cookie))).toEqual({ value: SESSION, isPresent: true });
  });

  it('reports an absent cookie', () => {
    expect(readSessionCookie(requestWith('x=1'))).toEqual({ value: null, isPresent: false });
    expect(readSessionCookie(new Request('https://site.test/'))).toEqual({
      value: null,
      isPresent: false,
    });
  });

  it('reports an unreadable cookie as present with no value', () => {
    expect(readSessionCookie(requestWith('__Host-abyss_web_session=junk'))).toEqual({
      value: null,
      isPresent: true,
    });
  });

  it('does not open the 2FA value as a session (name is bound)', () => {
    const challenge = valueOf(
      writeTwoFactorCookie({ tempToken: 't', methods: ['email'], rememberMe: false }),
    );
    expect(
      readSessionCookie(requestWith(`__Host-abyss_web_session=${challenge}`)).value,
    ).toBeNull();
    expect(readTwoFactorCookie(requestWith(`__Host-abyss_web_2fa=${challenge}`)).value).toEqual({
      tempToken: 't',
      methods: ['email'],
      rememberMe: false,
    });
  });

  it('refuses a sealed value of the wrong shape', () => {
    const sealed = sealCookieValue('__Host-abyss_web_session', { refreshToken: 'r', extra: 1 });
    expect(readSessionCookie(requestWith(`__Host-abyss_web_session=${sealed}`))).toEqual({
      value: null,
      isPresent: true,
    });
  });
});
