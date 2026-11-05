import { TURNSTILE } from './Security.constants';
import {
  DEFAULT_REVALIDATE_SECONDS,
  DEFAULT_TRUST_PROXY_HOPS,
  parseServerEnv,
  SESSION_SECRET_MIN_BYTES,
  TURNSTILE_TEST_SECRET_OPT_IN,
} from './Server.env';

const VALID = {
  API_INTERNAL_URL: 'http://cms-api:3000/api/v1/',
  WEB_ORIGIN: 'https://example.test/',
  WEB_SESSION_SECRET: 'short-dev-secret',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
};

const PRODUCTION_HOSTNAME = { TURNSTILE_EXPECTED_HOSTNAME: 'example.test' };

describe('parseServerEnv', () => {
  it('reads the values and strips the trailing slash', () => {
    expect(parseServerEnv({ ...VALID, WEB_REVALIDATE_SECONDS: '0' })).toEqual({
      apiInternalUrl: 'http://cms-api:3000/api/v1',
      revalidateSeconds: 0,
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
    expect(() =>
      parseServerEnv({ ...VALID, ...PRODUCTION_HOSTNAME, NODE_ENV: 'production' }),
    ).toThrow(/WEB_SESSION_SECRET must be at least 32 bytes/);
    const secret = 'a'.repeat(SESSION_SECRET_MIN_BYTES);
    expect(
      parseServerEnv({
        ...VALID,
        ...PRODUCTION_HOSTNAME,
        NODE_ENV: 'production',
        WEB_SESSION_SECRET: secret,
      }).sessionSecret,
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

  describe('Turnstile production guard', () => {
    const PRODUCTION = { ...VALID, NODE_ENV: 'production', WEB_SESSION_SECRET: 'x'.repeat(40) };
    const TEST_SECRET = { TURNSTILE_SECRET_KEY: TURNSTILE.ALWAYS_PASS_TEST_SECRET };

    it('refuses the test secret in production without the opt-in', () => {
      expect(() => parseServerEnv({ ...PRODUCTION, ...TEST_SECRET })).toThrow(/test secret/);
    });

    it('allows the test secret in production with the smoke opt-in, hostname optional', () => {
      const env = parseServerEnv({
        ...PRODUCTION,
        ...TEST_SECRET,
        ALLOW_TURNSTILE_TEST_SECRET: TURNSTILE_TEST_SECRET_OPT_IN,
      });
      expect(env.turnstileExpectedHostname).toBeUndefined();
    });

    it.each(['true', '1', 'Smoke'])('refuses the opt-in value %s in any environment', (value) => {
      expect(() => parseServerEnv({ ...VALID, ALLOW_TURNSTILE_TEST_SECRET: value })).toThrow(
        /ALLOW_TURNSTILE_TEST_SECRET/,
      );
      expect(() =>
        parseServerEnv({ ...PRODUCTION, ...TEST_SECRET, ALLOW_TURNSTILE_TEST_SECRET: value }),
      ).toThrow(/ALLOW_TURNSTILE_TEST_SECRET/);
    });

    it('treats a blank opt-in as unset', () => {
      expect(() =>
        parseServerEnv({ ...PRODUCTION, ...TEST_SECRET, ALLOW_TURNSTILE_TEST_SECRET: ' ' }),
      ).toThrow(/test secret/);
    });

    it('requires the hostname with a real secret in production', () => {
      expect(() => parseServerEnv(PRODUCTION)).toThrow(/TURNSTILE_EXPECTED_HOSTNAME is required/);
      expect(
        parseServerEnv({ ...PRODUCTION, TURNSTILE_EXPECTED_HOSTNAME: 'Example.test' })
          .turnstileExpectedHostname,
      ).toBe('example.test');
    });

    it('starts in development with the test secret, no hostname and no opt-in', () => {
      expect(() =>
        parseServerEnv({ ...VALID, ...TEST_SECRET, NODE_ENV: 'development' }),
      ).not.toThrow();
    });

    it.each(['https://example.test', 'example.test/path', '-bad', 'a b'])(
      'refuses the hostname %s',
      (value) => {
        expect(() => parseServerEnv({ ...VALID, TURNSTILE_EXPECTED_HOSTNAME: value })).toThrow(
          /TURNSTILE_EXPECTED_HOSTNAME must be a bare hostname/,
        );
      },
    );
  });
});
