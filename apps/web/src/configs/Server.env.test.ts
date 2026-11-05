import {
  DEFAULT_REVALIDATE_SECONDS,
  DEFAULT_TRUST_PROXY_HOPS,
  parseServerEnv,
  SESSION_SECRET_MIN_BYTES,
} from './Server.env';

const VALID = {
  API_INTERNAL_URL: 'http://cms-api:3000/api/v1/',
  WEB_ORIGIN: 'https://example.test/',
  WEB_SESSION_SECRET: 'short-dev-secret',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
};

describe('parseServerEnv', () => {
  it('reads the values and strips the trailing slash', () => {
    expect(parseServerEnv({ ...VALID, WEB_REVALIDATE_SECONDS: '0' })).toEqual({
      apiInternalUrl: 'http://cms-api:3000/api/v1',
      revalidateSeconds: 0,
      isStatusPageEnabled: false,
      webOrigin: 'https://example.test',
      sessionSecret: 'short-dev-secret',
      turnstileSecretKey: 'turnstile-secret',
      turnstileExpectedHostname: undefined,
      trustProxyHops: DEFAULT_TRUST_PROXY_HOPS,
      clientIpHeader: undefined,
    });
  });

  it('defaults the revalidate window when unset or blank', () => {
    expect(parseServerEnv(VALID).revalidateSeconds).toBe(DEFAULT_REVALIDATE_SECONDS);
    expect(parseServerEnv({ ...VALID, WEB_REVALIDATE_SECONDS: ' ' }).revalidateSeconds).toBe(
      DEFAULT_REVALIDATE_SECONDS,
    );
  });

  it('fails when API_INTERNAL_URL is missing or not absolute', () => {
    expect(() => parseServerEnv({ ...VALID, API_INTERNAL_URL: undefined })).toThrow(
      /API_INTERNAL_URL is not set/,
    );
    expect(() => parseServerEnv({ ...VALID, API_INTERNAL_URL: '/api/v1' })).toThrow(/absolute URL/);
  });

  it.each(['-1', '1.5', 'abc'])('fails on WEB_REVALIDATE_SECONDS=%s', (value) => {
    expect(() => parseServerEnv({ ...VALID, WEB_REVALIDATE_SECONDS: value })).toThrow(
      /WEB_REVALIDATE_SECONDS/,
    );
  });

  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['true', true],
  ])('reads WEB_STATUS_PAGE_ENABLED=%j as %s', (value, expected) => {
    expect(parseServerEnv({ ...VALID, WEB_STATUS_PAGE_ENABLED: value }).isStatusPageEnabled).toBe(
      expected,
    );
  });

  it.each(['TRUE', '1', 'yes', 'on'])('fails on WEB_STATUS_PAGE_ENABLED=%s', (value) => {
    expect(() => parseServerEnv({ ...VALID, WEB_STATUS_PAGE_ENABLED: value })).toThrow(
      /WEB_STATUS_PAGE_ENABLED/,
    );
  });

  it.each(['WEB_ORIGIN', 'WEB_SESSION_SECRET', 'TURNSTILE_SECRET_KEY'])(
    'fails without %s',
    (key) => {
      expect(() => parseServerEnv({ ...VALID, [key]: ' ' })).toThrow(
        new RegExp(`${key} is not set`),
      );
    },
  );

  it.each(['/path', 'ftp://example.test', 'https://example.test/app', 'example.test'])(
    'fails on WEB_ORIGIN=%s',
    (value) => {
      expect(() => parseServerEnv({ ...VALID, WEB_ORIGIN: value })).toThrow(/WEB_ORIGIN must be/);
    },
  );

  it('requires a long WEB_SESSION_SECRET only in production', () => {
    expect(() => parseServerEnv({ ...VALID, NODE_ENV: 'production' })).toThrow(
      /WEB_SESSION_SECRET must be at least 32 bytes/,
    );
    const secret = 'a'.repeat(SESSION_SECRET_MIN_BYTES);
    expect(
      parseServerEnv({ ...VALID, NODE_ENV: 'production', WEB_SESSION_SECRET: secret })
        .sessionSecret,
    ).toBe(secret);
  });

  it('reads the optional proxy and Turnstile keys', () => {
    const env = parseServerEnv({
      ...VALID,
      TRUST_PROXY_HOPS: '0',
      CLIENT_IP_HEADER: ' CF-Connecting-IP ',
      TURNSTILE_EXPECTED_HOSTNAME: 'example.test',
    });
    expect(env).toMatchObject({
      trustProxyHops: 0,
      clientIpHeader: 'CF-Connecting-IP',
      turnstileExpectedHostname: 'example.test',
    });
  });

  it.each(['-1', '1.5', 'abc'])('fails on TRUST_PROXY_HOPS=%s', (value) => {
    expect(() => parseServerEnv({ ...VALID, TRUST_PROXY_HOPS: value })).toThrow(/TRUST_PROXY_HOPS/);
  });
});
