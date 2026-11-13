import { TURNSTILE } from './Security.constants';
import {
  DEFAULT_TRUST_PROXY_HOPS,
  parseServerEnv as parseServerEnvWithBuild,
  SESSION_SECRET_MIN_BYTES,
  SMOKE_STACK_OPT_IN,
} from './Server.env';

/** The build value defaults to the runtime one, as in a correct image. */
function parseServerEnv(source: Record<string, string | undefined>, buildAppEnv = source.APP_ENV) {
  return parseServerEnvWithBuild(source, buildAppEnv);
}

const VALID = {
  APP_ENV: 'staging',
  APP_API_URL: 'http://cms-api:3000/api/v1/',
  WEB_ORIGIN: 'https://example.test/',
  WEB_SESSION_SECRET: 'short-dev-secret',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
};

/** What a production start needs besides the base values: the Turnstile hostname and the API token. */
const PRODUCTION_HOSTNAME = {
  TURNSTILE_EXPECTED_HOSTNAME: 'example.test',
  APP_API_TOKEN: 'ak_live_abc',
};

describe('parseServerEnv', () => {
  it('reads the values and strips the trailing slash', () => {
    expect(parseServerEnv({ ...VALID, WEB_REVALIDATE_SECONDS: '0' })).toEqual({
      appApiUrl: 'http://cms-api:3000/api/v1',
      appApiToken: undefined,
      revalidateOverrideSeconds: 0,
      appEnv: 'staging',
      isMockFallbackOn: true,
      webOrigin: 'https://example.test',
      sessionSecret: 'short-dev-secret',
      turnstileSecretKey: 'turnstile-secret',
      turnstileExpectedHostname: undefined,
      trustProxyHops: DEFAULT_TRUST_PROXY_HOPS,
      clientIpHeader: undefined,
      bffRateLimitOverrides: {},
    });
  });

  it.each([undefined, '', ' '])('has no revalidate override when the key is %j', (value) => {
    expect(
      parseServerEnv({ ...VALID, WEB_REVALIDATE_SECONDS: value }).revalidateOverrideSeconds,
    ).toBeUndefined();
  });

  it('reads the revalidate override', () => {
    expect(
      parseServerEnv({ ...VALID, WEB_REVALIDATE_SECONDS: ' 15 ' }).revalidateOverrideSeconds,
    ).toBe(15);
  });

  it.each([undefined, ' ', '/api/v1'])('fails when APP_API_URL is %j', (value) => {
    expect(() => parseServerEnv({ ...VALID, APP_API_URL: value })).toThrow(/APP_API_URL/);
  });

  it('does not accept API_INTERNAL_URL in place of APP_API_URL', () => {
    expect(() =>
      parseServerEnv({
        ...VALID,
        APP_API_URL: undefined,
        API_INTERNAL_URL: 'http://cms-api:3000/api/v1',
      }),
    ).toThrow(/APP_API_URL is not set/);
  });

  it.each(['-1', '1.5', 'abc'])('fails on WEB_REVALIDATE_SECONDS=%s', (value) => {
    expect(() => parseServerEnv({ ...VALID, WEB_REVALIDATE_SECONDS: value })).toThrow(
      /WEB_REVALIDATE_SECONDS/,
    );
  });

  describe('APP_API_TOKEN', () => {
    const TOKEN = `ak_live_${'Ab3_-'.repeat(8)}`;
    const PRODUCTION = {
      ...VALID,
      ...PRODUCTION_HOSTNAME,
      NODE_ENV: 'production',
      WEB_SESSION_SECRET: 'x'.repeat(40),
    };

    it('is optional outside production and read trimmed when set', () => {
      expect(parseServerEnv(VALID).appApiToken).toBeUndefined();
      expect(parseServerEnv({ ...VALID, APP_API_TOKEN: ` ${TOKEN} ` }).appApiToken).toBe(TOKEN);
    });

    it.each([undefined, ' '])('is required in production when the key is %j', (value) => {
      expect(() => parseServerEnv({ ...PRODUCTION, APP_API_TOKEN: value })).toThrow(
        /APP_API_TOKEN is required in production/,
      );
    });

    it('starts in production with a valid token', () => {
      expect(parseServerEnv({ ...PRODUCTION, APP_API_TOKEN: TOKEN }).appApiToken).toBe(TOKEN);
    });

    it.each(['ak_test_abc', 'ak_live_', 'ak_live_a b', 'ak_live_a+b', 'plain-secret'])(
      'refuses a malformed token without printing it',
      (value) => {
        let message = '';
        try {
          parseServerEnv({ ...VALID, APP_API_TOKEN: value });
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).toMatch(/APP_API_TOKEN must be an API token/);
        expect(message).not.toContain(value.slice('ak_live_'.length) || 'ak_test_abc');
      },
    );
  });

  describe('APP_ENV', () => {
    it.each([undefined, '', ' '])('fails when the key is %j', (value) => {
      expect(() => parseServerEnv({ ...VALID, APP_ENV: value })).toThrow(/APP_ENV is not set/);
    });

    it.each(['prod', 'Production', 'test'])('fails on the unknown value %s', (value) => {
      expect(() => parseServerEnv({ ...VALID, APP_ENV: value })).toThrow(/APP_ENV must be one of/);
    });

    it.each([undefined, 'production', 'development'])(
      'fails when the build value is %j and the runtime value is staging',
      (build) => {
        expect(() => parseServerEnvWithBuild(VALID, build)).toThrow(
          /APP_ENV at runtime must equal/,
        );
      },
    );

    it.each([
      ['development', true],
      ['staging', true],
      ['production', false],
    ])('%s turns the mock fallback on: %s', (appEnv, isOn) => {
      const env = parseServerEnv({ ...VALID, APP_ENV: appEnv });
      expect(env.appEnv).toBe(appEnv);
      expect(env.isMockFallbackOn).toBe(isOn);
    });

    it('ignores NODE_ENV and the retired ALLOW_MOCK_FALLBACK key', () => {
      const env = {
        ...VALID,
        ...PRODUCTION_HOSTNAME,
        NODE_ENV: 'production',
        WEB_SESSION_SECRET: 'x'.repeat(40),
        ALLOW_MOCK_FALLBACK: SMOKE_STACK_OPT_IN,
      };
      expect(parseServerEnv(env).isMockFallbackOn).toBe(true);
      expect(parseServerEnv({ ...env, APP_ENV: 'production' }).isMockFallbackOn).toBe(false);
    });
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

  describe('BFF rate limit override', () => {
    const PRODUCTION = {
      ...VALID,
      NODE_ENV: 'production',
      WEB_SESSION_SECRET: 'x'.repeat(40),
      APP_API_TOKEN: 'ak_live_abc',
    };
    const WITH_HOSTNAME = { ...PRODUCTION, ...PRODUCTION_HOSTNAME };

    it.each([undefined, '', ' '])('has no override when the key is %j', (value) => {
      expect(
        parseServerEnv({ ...VALID, BFF_AUTH_RATE_LIMIT_IP: value }).bffRateLimitOverrides,
      ).toEqual({});
    });

    it('reads a valid override outside production without the opt-in', () => {
      expect(
        parseServerEnv({ ...VALID, BFF_AUTH_RATE_LIMIT_IP: '10000' }).bffRateLimitOverrides,
      ).toEqual({
        auth: 10000,
      });
    });

    it.each(['0', '-1', '1.5', 'abc'])('fails on BFF_AUTH_RATE_LIMIT_IP=%s', (value) => {
      expect(() => parseServerEnv({ ...VALID, BFF_AUTH_RATE_LIMIT_IP: value })).toThrow(
        /BFF_AUTH_RATE_LIMIT_IP/,
      );
    });

    it('refuses the override in production without the opt-in, naming the key', () => {
      expect(() => parseServerEnv({ ...WITH_HOSTNAME, BFF_AUTH_RATE_LIMIT_IP: '100' })).toThrow(
        /BFF_AUTH_RATE_LIMIT_IP/,
      );
    });

    it('allows the override in production with the smoke opt-in', () => {
      const env = parseServerEnv({
        ...WITH_HOSTNAME,
        BFF_AUTH_RATE_LIMIT_IP: '100',
        ALLOW_BFF_RATE_LIMIT_OVERRIDE: SMOKE_STACK_OPT_IN,
      });
      expect(env.bffRateLimitOverrides).toEqual({ auth: 100 });
    });

    it('starts in production with neither key', () => {
      expect(parseServerEnv(WITH_HOSTNAME).bffRateLimitOverrides).toEqual({});
    });

    it.each(['true', '1', 'Smoke'])('refuses the opt-in value %s in any environment', (value) => {
      expect(() => parseServerEnv({ ...VALID, ALLOW_BFF_RATE_LIMIT_OVERRIDE: value })).toThrow(
        /ALLOW_BFF_RATE_LIMIT_OVERRIDE/,
      );
      expect(() =>
        parseServerEnv({ ...WITH_HOSTNAME, ALLOW_BFF_RATE_LIMIT_OVERRIDE: value }),
      ).toThrow(/ALLOW_BFF_RATE_LIMIT_OVERRIDE/);
    });
  });

  describe('Turnstile production guard', () => {
    const PRODUCTION = {
      ...VALID,
      NODE_ENV: 'production',
      WEB_SESSION_SECRET: 'x'.repeat(40),
      APP_API_TOKEN: 'ak_live_abc',
    };
    const TEST_SECRET = { TURNSTILE_SECRET_KEY: TURNSTILE.ALWAYS_PASS_TEST_SECRET };

    it('refuses the test secret in production without the opt-in', () => {
      expect(() => parseServerEnv({ ...PRODUCTION, ...TEST_SECRET })).toThrow(/test secret/);
    });

    it('allows the test secret in production with the smoke opt-in, hostname optional', () => {
      const env = parseServerEnv({
        ...PRODUCTION,
        ...TEST_SECRET,
        ALLOW_TURNSTILE_TEST_SECRET: SMOKE_STACK_OPT_IN,
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
