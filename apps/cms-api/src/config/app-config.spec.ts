import {
  devEnv,
  productionEnv,
  TEST_ADMIN_ORIGIN,
  TEST_JWT_KID,
  TEST_MAIL_FROM,
  TEST_SECRET_32_BYTES,
  TEST_SHORT_SECRET,
  TEST_SMTP_HOST,
  TEST_SMTP_PASSWORD,
  TEST_SMTP_USER,
  TEST_TOTP_ENC_KID,
  TEST_TOTP_ENC_PREVIOUS_KID,
} from '../../test/fixtures/env.fixture';
import {
  ConfigValidationError,
  loadAppConfig,
  summarizeConfig,
} from './app-config';
import { RATE_LIMIT_RULE_NAMES } from '../common/constants/limits.constants';
import { CONFIG_DEFAULTS, REDACTED, SECRET_ENV_KEYS } from './config.constants';

function configErrorOf(
  env: Record<string, string | undefined>,
): ConfigValidationError {
  try {
    loadAppConfig(env);
  } catch (error) {
    if (error instanceof ConfigValidationError) return error;
    throw error;
  }
  throw new Error('expected loadAppConfig to throw');
}

describe('loadAppConfig', () => {
  it('applies defaults outside production', () => {
    const config = loadAppConfig(devEnv());
    expect(config.http.port).toBe(CONFIG_DEFAULTS.PORT);
    expect(config.http.trustProxyHops).toBe(CONFIG_DEFAULTS.TRUST_PROXY_HOPS);
    expect(config.mail.provider).toBe('console');
    expect(config.isProduction).toBe(false);
    expect(config.secrets.jwtAccessSecret).toBeUndefined();
  });

  it('coerces numeric keys and lowercases the client IP header', () => {
    const config = loadAppConfig(
      devEnv({
        PORT: '8080',
        TRUST_PROXY_HOPS: '2',
        CLIENT_IP_HEADER: 'CF-Connecting-IP',
      }),
    );
    expect(config.http).toEqual({
      port: 8080,
      trustProxyHops: 2,
      clientIpHeader: 'cf-connecting-ip',
    });
  });

  it('treats empty optional values as unset', () => {
    const config = loadAppConfig(
      devEnv({ CLIENT_IP_HEADER: '', OTP_PEPPER: '' }),
    );
    expect(config.http.clientIpHeader).toBeUndefined();
    expect(config.secrets.otpPepper).toBeUndefined();
  });

  it('leaves CORS off when ADMIN_ORIGIN is unset or empty', () => {
    expect(loadAppConfig(devEnv()).cors.allowedOrigins).toEqual([]);
    expect(
      loadAppConfig(devEnv({ ADMIN_ORIGIN: '' })).cors.allowedOrigins,
    ).toEqual([]);
  });

  it.each(['https://admin.example.com', 'http://admin.domain.localhost:8080'])(
    'allows exactly the admin origin %s',
    (origin) => {
      const config = loadAppConfig(devEnv({ ADMIN_ORIGIN: origin }));
      expect(config.cors.allowedOrigins).toEqual([origin]);
    },
  );

  it('builds the refresh-cookie origin allowlist from WEB_ORIGIN and ADMIN_ORIGIN', () => {
    expect(loadAppConfig(devEnv()).auth.cookieOrigins).toEqual([]);
    expect(
      loadAppConfig(
        devEnv({
          WEB_ORIGIN: 'https://example.com',
          ADMIN_ORIGIN: 'https://admin.example.com',
        }),
      ).auth.cookieOrigins,
    ).toEqual(['https://example.com', 'https://admin.example.com']);
  });

  it('keeps CORS admin-only when WEB_ORIGIN is set', () => {
    const config = loadAppConfig(
      devEnv({
        WEB_ORIGIN: 'https://example.com',
        ADMIN_ORIGIN: 'https://admin.example.com',
      }),
    );
    expect(config.cors.allowedOrigins).toEqual(['https://admin.example.com']);
  });

  it('defaults the JWT key id outside production', () => {
    expect(loadAppConfig(devEnv()).auth.jwtAccessKid).toBe(
      CONFIG_DEFAULTS.JWT_ACCESS_KID,
    );
    expect(
      loadAppConfig(devEnv({ JWT_ACCESS_KID: '2026-10' })).auth.jwtAccessKid,
    ).toBe('2026-10');
  });

  it('returns a deeply frozen object', () => {
    const config = loadAppConfig(devEnv());
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.http)).toBe(true);
    expect(Object.isFrozen(config.secrets)).toBe(true);
  });

  it.each([
    ['missing DATABASE_URL', { DATABASE_URL: undefined }, 'DATABASE_URL'],
    [
      'non-postgres DATABASE_URL',
      { DATABASE_URL: 'mysql://h/db' },
      'DATABASE_URL',
    ],
    ['non-numeric PORT', { PORT: 'abc' }, 'PORT'],
    ['out of range PORT', { PORT: '70000' }, 'PORT'],
    [
      'negative TRUST_PROXY_HOPS',
      { TRUST_PROXY_HOPS: '-1' },
      'TRUST_PROXY_HOPS',
    ],
    ['unknown MAIL_PROVIDER', { MAIL_PROVIDER: 'pigeon' }, 'MAIL_PROVIDER'],
    ['unknown NODE_ENV', { NODE_ENV: 'staging' }, 'NODE_ENV'],
    ['wildcard ADMIN_ORIGIN', { ADMIN_ORIGIN: '*' }, 'ADMIN_ORIGIN'],
    [
      'ADMIN_ORIGIN with a trailing slash',
      { ADMIN_ORIGIN: 'https://admin.example.com/' },
      'ADMIN_ORIGIN',
    ],
    [
      'ADMIN_ORIGIN with a path',
      { ADMIN_ORIGIN: 'https://admin.example.com/app' },
      'ADMIN_ORIGIN',
    ],
    [
      'non-http ADMIN_ORIGIN',
      { ADMIN_ORIGIN: 'ftp://admin.example.com' },
      'ADMIN_ORIGIN',
    ],
    [
      'WEB_ORIGIN with a path',
      { WEB_ORIGIN: 'https://example.com/x' },
      'WEB_ORIGIN',
    ],
    [
      'JWT_ACCESS_KID with spaces',
      { JWT_ACCESS_KID: 'key one' },
      'JWT_ACCESS_KID',
    ],
    [
      'over-long JWT_ACCESS_KID',
      { JWT_ACCESS_KID: 'k'.repeat(65) },
      'JWT_ACCESS_KID',
    ],
    [
      'header with spaces',
      { CLIENT_IP_HEADER: 'x forwarded' },
      'CLIENT_IP_HEADER',
    ],
  ])('rejects %s', (_label, overrides, key) => {
    const error = configErrorOf(devEnv(overrides));
    expect(error.issues.some((issue) => issue.startsWith(`${key}:`))).toBe(
      true,
    );
  });

  describe('SMTP mail (T12)', () => {
    const smtpEnv = (overrides: Record<string, string | undefined> = {}) =>
      devEnv({
        MAIL_PROVIDER: 'smtp',
        SMTP_HOST: TEST_SMTP_HOST,
        MAIL_FROM: TEST_MAIL_FROM,
        ...overrides,
      });

    it('applies SMTP defaults and leaves auth off without credentials', () => {
      const config = loadAppConfig(smtpEnv());
      expect(config.mail).toEqual({
        provider: 'smtp',
        from: TEST_MAIL_FROM,
        smtp: {
          host: TEST_SMTP_HOST,
          port: CONFIG_DEFAULTS.SMTP_PORT,
          secure: CONFIG_DEFAULTS.SMTP_SECURE,
          auth: undefined,
        },
      });
    });

    it('parses port, secure flag and credentials', () => {
      const config = loadAppConfig(
        smtpEnv({
          SMTP_PORT: '465',
          SMTP_SECURE: 'true',
          SMTP_USER: TEST_SMTP_USER,
          SMTP_PASSWORD: TEST_SMTP_PASSWORD,
        }),
      );
      expect(config.mail.smtp).toEqual({
        host: TEST_SMTP_HOST,
        port: 465,
        secure: true,
        auth: { user: TEST_SMTP_USER, password: TEST_SMTP_PASSWORD },
      });
    });

    it.each(['SMTP_HOST', 'MAIL_FROM'])(
      'requires %s when MAIL_PROVIDER=smtp',
      (key) => {
        const error = configErrorOf(smtpEnv({ [key]: undefined }));
        expect(error.issues).toContain(
          `${key}: ${key} is required when MAIL_PROVIDER=smtp`,
        );
      },
    );

    it.each([
      { SMTP_USER: TEST_SMTP_USER },
      { SMTP_PASSWORD: TEST_SMTP_PASSWORD },
    ])('requires SMTP_USER and SMTP_PASSWORD together (%o)', (overrides) => {
      const error = configErrorOf(smtpEnv(overrides));
      expect(error.issues).toEqual([
        'SMTP_PASSWORD: SMTP_USER and SMTP_PASSWORD must be set together or both left empty',
      ]);
    });

    it('ignores SMTP settings with the console provider', () => {
      expect(loadAppConfig(devEnv()).mail.smtp).toBeUndefined();
    });

    it('accepts a short SMTP password (Gmail App Passwords are 16 chars)', () => {
      expect(() =>
        loadAppConfig(
          productionEnv({
            SMTP_USER: TEST_SMTP_USER,
            SMTP_PASSWORD: TEST_SMTP_PASSWORD,
          }),
        ),
      ).not.toThrow();
    });
  });

  describe('production guards (D17, SPEC §12-15)', () => {
    it('accepts a complete production environment', () => {
      const config = loadAppConfig(productionEnv());
      expect(config.isProduction).toBe(true);
      expect(config.mail.provider).toBe('smtp');
    });

    it('rejects MAIL_PROVIDER=console', () => {
      const error = configErrorOf(productionEnv({ MAIL_PROVIDER: 'console' }));
      expect(error.issues).toContain(
        'MAIL_PROVIDER: MAIL_PROVIDER=console is not allowed in production',
      );
    });

    it('rejects the default mail provider when MAIL_PROVIDER is unset', () => {
      const error = configErrorOf(productionEnv({ MAIL_PROVIDER: undefined }));
      expect(error.issues[0]).toMatch(/^MAIL_PROVIDER:/);
    });

    it.each(['ADMIN_ORIGIN', 'WEB_ORIGIN', 'JWT_ACCESS_KID', 'TOTP_ENC_KID'])(
      'rejects a missing %s',
      (key) => {
        const error = configErrorOf(productionEnv({ [key]: undefined }));
        expect(error.issues).toContain(
          `${key}: ${key} is required in production`,
        );
      },
    );

    it('uses the configured JWT key id', () => {
      expect(loadAppConfig(productionEnv()).auth.jwtAccessKid).toBe(
        TEST_JWT_KID,
      );
    });

    it('uses the configured TOTP encryption key id', () => {
      expect(loadAppConfig(productionEnv()).auth.totp.encKid).toBe(
        TEST_TOTP_ENC_KID,
      );
    });

    it('rejects a short TOTP_ENC_PREVIOUS_KEY', () => {
      const error = configErrorOf(
        productionEnv({
          TOTP_ENC_PREVIOUS_KEY: TEST_SHORT_SECRET,
          TOTP_ENC_PREVIOUS_KID: TEST_TOTP_ENC_PREVIOUS_KID,
        }),
      );
      expect(error.issues[0]).toMatch(/^TOTP_ENC_PREVIOUS_KEY:/);
    });

    it('keeps the admin origin from production config', () => {
      expect(loadAppConfig(productionEnv()).cors.allowedOrigins).toEqual([
        TEST_ADMIN_ORIGIN,
      ]);
    });

    it.each(SECRET_ENV_KEYS)('rejects a missing %s', (key) => {
      const error = configErrorOf(productionEnv({ [key]: undefined }));
      expect(error.issues).toContain(
        `${key}: ${key} is required in production`,
      );
    });

    it.each(SECRET_ENV_KEYS)('rejects a short %s without echoing it', (key) => {
      const error = configErrorOf(productionEnv({ [key]: TEST_SHORT_SECRET }));
      expect(error.issues).toContain(
        `${key}: ${key} must be at least 32 bytes in production`,
      );
      expect(error.message).not.toContain(TEST_SHORT_SECRET);
    });

    it('measures secret length in bytes, not characters', () => {
      // 16 two-byte characters = 32 bytes.
      const multiByte = 'é'.repeat(16);
      expect(() =>
        loadAppConfig(productionEnv({ OTP_PEPPER: multiByte })),
      ).not.toThrow();
    });

    it('reports every problem at once', () => {
      const error = configErrorOf(
        productionEnv({
          MAIL_PROVIDER: 'console',
          JWT_ACCESS_SECRET: undefined,
          OTP_PEPPER: TEST_SHORT_SECRET,
        }),
      );
      expect(error.issues).toHaveLength(3);
    });
  });
});

describe('summarizeConfig', () => {
  it('redacts secrets and database credentials', () => {
    const config = loadAppConfig(productionEnv());
    const summary = JSON.stringify(summarizeConfig(config));
    expect(summary).not.toContain(TEST_SECRET_32_BYTES);
    expect(summary).not.toContain('abyss_test_pw');
    expect(summary).not.toContain('abyss_test:');
    expect(summarizeConfig(config).database).toEqual({
      url: `postgresql://${REDACTED}@127.0.0.1:5432/abyss_test`,
    });
  });

  it('redacts the SMTP password', () => {
    const config = loadAppConfig(
      productionEnv({
        SMTP_USER: TEST_SMTP_USER,
        SMTP_PASSWORD: TEST_SMTP_PASSWORD,
      }),
    );
    const summary = summarizeConfig(config);
    expect(JSON.stringify(summary)).not.toContain(TEST_SMTP_PASSWORD);
    expect(summary.mail).toEqual({
      provider: 'smtp',
      from: TEST_MAIL_FROM,
      smtp: {
        host: TEST_SMTP_HOST,
        port: CONFIG_DEFAULTS.SMTP_PORT,
        secure: CONFIG_DEFAULTS.SMTP_SECURE,
        user: TEST_SMTP_USER,
        password: REDACTED,
      },
    });
  });

  it('drops the query string, which may carry a password', () => {
    const config = loadAppConfig(
      devEnv({ DATABASE_URL: 'postgresql://db.local/app?password=hunter2' }),
    );
    expect(summarizeConfig(config).database).toEqual({
      url: 'postgresql://db.local/app',
    });
  });

  it('shows unset secrets as unset', () => {
    const summary = summarizeConfig(loadAppConfig(devEnv()));
    expect(summary.secrets).toEqual({
      jwtAccessSecret: 'unset',
      otpPepper: 'unset',
      totpEncKey: 'unset',
      totpEncPreviousKey: 'unset',
    });
  });
});

describe('login rate-limit overrides (T18b)', () => {
  it('has no overrides by default', () => {
    expect(loadAppConfig(devEnv()).rateLimit.limitOverrides).toEqual({});
  });

  it('reads both overrides, and an empty value counts as unset', () => {
    const config = loadAppConfig(
      devEnv({ LOGIN_RATE_LIMIT_IP: '500', LOGIN_RATE_LIMIT_EMAIL: '' }),
    );
    expect(config.rateLimit.limitOverrides).toEqual({
      [RATE_LIMIT_RULE_NAMES.LOGIN_IP]: 500,
    });
  });

  it.each(['LOGIN_RATE_LIMIT_IP', 'LOGIN_RATE_LIMIT_EMAIL'])(
    'refuses %s in production without the opt-in',
    (key) => {
      const error = configErrorOf(productionEnv({ [key]: '500' }));
      expect(error.issues[0]).toMatch(
        new RegExp(`^${key}: .*not allowed in production`),
      );
    },
  );

  it('accepts the overrides in production with ALLOW_LOGIN_RATE_LIMIT_OVERRIDE=smoke', () => {
    const config = loadAppConfig(
      productionEnv({
        ALLOW_LOGIN_RATE_LIMIT_OVERRIDE: 'smoke',
        LOGIN_RATE_LIMIT_IP: '500',
        LOGIN_RATE_LIMIT_EMAIL: '400',
      }),
    );
    expect(config.rateLimit.limitOverrides).toEqual({
      [RATE_LIMIT_RULE_NAMES.LOGIN_IP]: 500,
      [RATE_LIMIT_RULE_NAMES.LOGIN_EMAIL]: 400,
    });
  });

  it.each(['yes', 'true', 'SMOKE', '1'])(
    'refuses the opt-in value %s',
    (value) => {
      const error = configErrorOf(
        productionEnv({
          ALLOW_LOGIN_RATE_LIMIT_OVERRIDE: value,
          LOGIN_RATE_LIMIT_IP: '500',
        }),
      );
      expect(error.issues[0]).toMatch(/^ALLOW_LOGIN_RATE_LIMIT_OVERRIDE:/);
    },
  );

  it('accepts the overrides without the opt-in outside production', () => {
    expect(
      loadAppConfig(devEnv({ LOGIN_RATE_LIMIT_IP: '500' })).rateLimit
        .limitOverrides,
    ).toEqual({ [RATE_LIMIT_RULE_NAMES.LOGIN_IP]: 500 });
  });

  it.each(['0', '-1', '1.5', 'abc', '1000001'])(
    'fails the start for LOGIN_RATE_LIMIT_EMAIL=%s',
    (value) => {
      const error = configErrorOf(devEnv({ LOGIN_RATE_LIMIT_EMAIL: value }));
      expect(error.issues[0]).toMatch(/^LOGIN_RATE_LIMIT_EMAIL:/);
    },
  );
});

describe('TOTP key config (T13)', () => {
  it('defaults the key id and issuer outside production', () => {
    expect(loadAppConfig(devEnv()).auth.totp).toEqual({
      encKid: CONFIG_DEFAULTS.TOTP_ENC_KID,
      previousEncKid: undefined,
      issuer: CONFIG_DEFAULTS.TOTP_ISSUER,
    });
  });

  it('reads the previous key pair and a custom issuer', () => {
    const config = loadAppConfig(
      devEnv({
        TOTP_ENC_PREVIOUS_KEY: TEST_SECRET_32_BYTES,
        TOTP_ENC_PREVIOUS_KID: TEST_TOTP_ENC_PREVIOUS_KID,
        TOTP_ISSUER: 'Acme Admin',
      }),
    );
    expect(config.auth.totp.previousEncKid).toBe(TEST_TOTP_ENC_PREVIOUS_KID);
    expect(config.auth.totp.issuer).toBe('Acme Admin');
    expect(config.secrets.totpEncPreviousKey).toBe(TEST_SECRET_32_BYTES);
  });

  it('requires the previous key and kid together', () => {
    const error = configErrorOf(
      devEnv({ TOTP_ENC_PREVIOUS_KEY: TEST_SECRET_32_BYTES }),
    );
    expect(error.issues[0]).toMatch(/^TOTP_ENC_PREVIOUS_KID:/);
  });

  it('rejects a previous kid equal to the current one', () => {
    const error = configErrorOf(
      devEnv({
        TOTP_ENC_PREVIOUS_KEY: TEST_SECRET_32_BYTES,
        TOTP_ENC_PREVIOUS_KID: CONFIG_DEFAULTS.TOTP_ENC_KID,
      }),
    );
    expect(error.issues).toContain(
      'TOTP_ENC_PREVIOUS_KID: TOTP_ENC_PREVIOUS_KID must differ from TOTP_ENC_KID',
    );
  });

  it.each(['Acme:Admin', 'x'.repeat(65)])('rejects the issuer %s', (issuer) => {
    const error = configErrorOf(devEnv({ TOTP_ISSUER: issuer }));
    expect(error.issues[0]).toMatch(/^TOTP_ISSUER:/);
  });
});
