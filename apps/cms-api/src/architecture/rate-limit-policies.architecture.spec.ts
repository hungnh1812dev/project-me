import 'reflect-metadata';

import { join } from 'node:path';

import {
  FIFTEEN_MINUTES_MS,
  ONE_HOUR_MS,
  ONE_MINUTE_MS,
  RATE_LIMIT_KEY_SOURCES,
  TEN_MINUTES_MS,
  type RateLimitRule,
} from '../common/constants/limits.constants';
import {
  RATE_LIMIT_POLICY_METADATA,
  ThrottleGuard,
} from '../common/guards/throttle.guard';
import { RATE_LIMIT_OVERRIDE_ENV_KEYS } from '../config/config.constants';
import { ACCESS_RATE_LIMIT_POLICIES } from '../modules/access/access.rate-limits.constants';
import { DOCUMENTS_RATE_LIMIT_POLICIES } from '../modules/documents/http/DocumentsRateLimits.constants';
import {
  IDENTITY_RATE_LIMIT_POLICIES,
  rateLimitOverrideBindings,
} from '../modules/identity/identity.rate-limits.constants';
import { MEDIA_RATE_LIMIT_POLICIES } from '../modules/media/media.rate-limits.constants';
import { REVIEWER_RATE_LIMIT_POLICIES } from '../modules/reviewer/reviewer.rate-limits.constants';
import {
  AUTHENTICATION_GUARDS,
  handlersOf,
  isControllerClass,
  type ControllerClass,
} from './controller-handlers';
import { listSourceFiles } from './import-graph';

const { IP, EMAIL, ACTOR, ANONYMOUS_IP } = RATE_LIMIT_KEY_SOURCES;

type PinnedRule = readonly [
  name: string,
  keySource: string,
  limit: number,
  windowMs: number,
];

/**
 * Every throttle policy pinned by value and order (SEC-AU1c C-01, C-02): the
 * IP rule stays first, and moving a policy never changes a limit. Windows are
 * written as literals so a change to a shared window constant shows up here.
 */
const PINNED_POLICIES: Record<string, readonly PinnedRule[]> = {
  LOGIN: [
    ['login:ip', IP, 10, 900_000],
    ['login:email', EMAIL, 5, 900_000],
  ],
  OTP_REQUEST: [
    ['otp-request:ip', IP, 5, 900_000],
    ['otp-request:email', EMAIL, 5, 3_600_000],
  ],
  PASSWORD_SUBMIT: [['password-submit:ip', IP, 10, 900_000]],
  PASSWORD_CHANGE: [['password-change:ip', IP, 5, 900_000]],
  TWO_FACTOR_VERIFY: [['2fa-verify:ip', IP, 10, 900_000]],
  TWO_FACTOR_EMAIL_CHALLENGE: [['2fa-email:ip', IP, 5, 900_000]],
  TWO_FACTOR_MANAGE: [['2fa-manage:ip', IP, 5, 900_000]],
  ACCOUNT_INVITE: [
    ['account-invite:ip', IP, 20, 3_600_000],
    ['account-invite:actor', ACTOR, 10, 3_600_000],
  ],
  DOCUMENT_READ_ANONYMOUS: [
    ['document-read:anonymous-ip', ANONYMOUS_IP, 120, 60_000],
  ],
  MEDIA_UPLOAD: [
    ['media-upload:ip', IP, 120, 3_600_000],
    ['media-upload:actor', ACTOR, 60, 3_600_000],
  ],
  SETUP_SUBMIT: [['setup-submit:ip', IP, 5, 900_000]],
  SETUP_STATUS: [['setup-status:ip', IP, 30, 60_000]],
  REVIEWER_STATUS: [['reviewer-status:ip', IP, 120, 60_000]],
  REVIEWER_SESSION_ATTEMPTS: [['reviewer-session:ip', IP, 20, 600_000]],
  REFRESH: [['refresh:ip', IP, 30, 60_000]],
};

const POLICIES_BY_MODULE: Record<
  string,
  Record<string, readonly RateLimitRule[]>
> = {
  identity: IDENTITY_RATE_LIMIT_POLICIES,
  access: ACCESS_RATE_LIMIT_POLICIES,
  documents: DOCUMENTS_RATE_LIMIT_POLICIES,
  media: MEDIA_RATE_LIMIT_POLICIES,
  reviewer: REVIEWER_RATE_LIMIT_POLICIES,
};

const allPolicies = Object.values(POLICIES_BY_MODULE).flatMap((policies) =>
  Object.entries(policies),
);
const allRules = allPolicies.flatMap(([, rules]) => rules);

describe('rate-limit policies', () => {
  it('pins every policy by name, key source, limit, window and order', () => {
    const actual = Object.fromEntries(
      allPolicies.map(([key, rules]) => [
        key,
        rules.map((rule) => [
          rule.name,
          rule.keySource,
          rule.maxHits,
          rule.windowMs,
        ]),
      ]),
    );
    expect(actual).toStrictEqual(PINNED_POLICIES);
  });

  it('keeps the shared window constants at their literal values', () => {
    expect([
      FIFTEEN_MINUTES_MS,
      ONE_HOUR_MS,
      ONE_MINUTE_MS,
      TEN_MINUTES_MS,
    ]).toStrictEqual([900_000, 3_600_000, 60_000, 600_000]);
  });

  it('gives every rule a name no other rule has (one shared counter store)', () => {
    const names = allRules.map((rule) => rule.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses no policy name in two modules', () => {
    const keys = allPolicies.map(([key]) => key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('puts the IP rule first in every policy that has one', () => {
    for (const [key, rules] of allPolicies) {
      const ipAt = rules.findIndex((rule) => rule.keySource === IP);
      expect({ key, ipAt }).toEqual({ key, ipAt: ipAt < 0 ? -1 : 0 });
    }
  });
});

describe('rate-limit override bindings', () => {
  it('pins exactly today three overrides', () => {
    expect(rateLimitOverrideBindings).toStrictEqual({
      LOGIN_RATE_LIMIT_IP: 'login:ip',
      LOGIN_RATE_LIMIT_EMAIL: 'login:email',
      REFRESH_RATE_LIMIT_IP: 'refresh:ip',
    });
  });

  it('binds every env key exactly once, in identity only', () => {
    const keyed = allRules.filter(
      (rule) => rule.limitOverrideEnvKey !== undefined,
    );
    expect(keyed.map((rule) => rule.limitOverrideEnvKey).sort()).toEqual(
      [...RATE_LIMIT_OVERRIDE_ENV_KEYS].sort(),
    );
    const outsideIdentity = Object.entries(POLICIES_BY_MODULE)
      .filter(([moduleName]) => moduleName !== 'identity')
      .flatMap(([, policies]) => Object.values(policies).flat())
      .filter((rule) => rule.limitOverrideEnvKey !== undefined);
    expect(outsideIdentity).toEqual([]);
  });
});

describe('throttled handlers', () => {
  const SRC_ROOT = join(__dirname, '..');
  const controllers = listSourceFiles(SRC_ROOT)
    .filter(({ text }) => text.includes('@Controller('))
    .flatMap(({ file }) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the file list is discovered at run time
      const loaded = require(join(SRC_ROOT, file)) as Record<string, unknown>;
      return Object.values(loaded).filter(isControllerClass);
    });
  const handlers = controllers.flatMap(handlersOf);
  const throttled = handlers.filter(
    ({ throttlePolicy }) => throttlePolicy !== undefined,
  );
  const needsAuthentication = (rules: readonly RateLimitRule[]) =>
    rules.some(
      (rule) => rule.keySource === ACTOR || rule.keySource === ANONYMOUS_IP,
    );

  it('finds throttled handlers', () => {
    expect(throttled.length).toBeGreaterThan(0);
  });

  it('declares @Throttle on methods, never on a class (the guard reads the handler only)', () => {
    const classLevel = controllers
      .filter(
        (controller: ControllerClass) =>
          Reflect.getMetadata(RATE_LIMIT_POLICY_METADATA, controller) !==
          undefined,
      )
      .map((controller) => controller.name);
    expect(classLevel).toEqual([]);
  });

  it('puts every ACTOR / ANONYMOUS_IP handler behind an authentication guard that runs first', () => {
    const unguarded = throttled
      .filter(({ throttlePolicy }) => needsAuthentication(throttlePolicy ?? []))
      .filter(({ guards }) => {
        const throttleAt = guards.indexOf(ThrottleGuard);
        return !guards
          .slice(0, throttleAt)
          .some((g) => AUTHENTICATION_GUARDS.includes(g));
      })
      .map(({ id }) => id);
    expect(unguarded).toEqual([]);
  });
});
