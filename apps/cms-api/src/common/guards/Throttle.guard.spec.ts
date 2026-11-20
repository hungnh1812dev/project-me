import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { IAppConfig } from '../../config/AppConfig.setup';
import type { RateLimitOverrideEnvKey } from '../../config/Config.constants';
import { RATE_LIMIT_KEY_SOURCES, type RateLimitRule } from '../constants/Limits.constants';
import type { ClientIpResolver } from '../http/ClientIp.resolver';
import type { RateLimitStore } from '../rate-limit/RateLimit.store';
import {
  AccountThrottleGuard,
  IpThrottleGuard,
  RATE_LIMIT_POLICY_METADATA,
  ThrottleGuard,
} from './Throttle.guard';

const OVERRIDDEN_RULE: RateLimitRule = {
  name: 'a:ip',
  keySource: RATE_LIMIT_KEY_SOURCES.IP,
  maxHits: 10,
  windowMs: 1_000,
  limitOverrideEnvKey: 'LOGIN_RATE_LIMIT_IP',
};
const OTHER_RULE: RateLimitRule = {
  name: 'b:ip',
  keySource: RATE_LIMIT_KEY_SOURCES.IP,
  maxHits: 10,
  windowMs: 1_000,
};

/** Hits each rule `hits` times through a guard whose config overrides `overrides`. */
async function rejectedRulesAfter(
  hits: number,
  overrides: Partial<Record<RateLimitOverrideEnvKey, number>>,
): Promise<string[]> {
  const counts = new Map<string, number>();
  const store: RateLimitStore = {
    hit: (key: string) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return Promise.resolve({ count, resetAt: 0 });
    },
  };
  const reflector = {
    get: () => [OVERRIDDEN_RULE, OTHER_RULE],
  } as unknown as Reflector;
  const guard = new ThrottleGuard(
    reflector,
    { resolve: () => '1.2.3.4' } as unknown as ClientIpResolver,
    store,
    { now: () => 0 },
    { rateLimit: { limitOverrides: overrides } } as unknown as IAppConfig,
    {
      accountSubjectOf: () => undefined,
      isAnonymousRequest: () => false,
    },
  );
  const rejected: string[] = [];
  const response = {
    setHeader: () => undefined,
  };
  const context = {
    getHandler: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({}) as Request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  for (let i = 0; i < hits; i += 1) {
    try {
      await guard.canActivate(context);
    } catch {
      rejected.push(`hit ${i + 1}`);
    }
  }
  return rejected;
}

describe('ThrottleGuard limit overrides', () => {
  it('exports the metadata key the architecture specs read', () => {
    expect(RATE_LIMIT_POLICY_METADATA).toBe('abyss:rate-limit-policy');
  });

  it('keeps the default limit without an override', async () => {
    expect(await rejectedRulesAfter(11, {})).toEqual(['hit 11']);
  });

  it('raises only the rule that declares the overridden env key', async () => {
    // OTHER_RULE still refuses at 11 although the first rule allows 500.
    expect(await rejectedRulesAfter(11, { LOGIN_RATE_LIMIT_IP: 500 })).toEqual(['hit 11']);
  });

  it('lowers the declared rule without touching the other', async () => {
    expect(await rejectedRulesAfter(4, { LOGIN_RATE_LIMIT_IP: 2 })).toEqual(['hit 3', 'hit 4']);
  });
});

describe('split throttle guards', () => {
  const emailRule: RateLimitRule = {
    name: 'c:email',
    keySource: RATE_LIMIT_KEY_SOURCES.EMAIL,
    maxHits: 10,
    windowMs: 1_000,
  };

  async function countedKeys(
    GuardClass: typeof ThrottleGuard,
    rules: readonly RateLimitRule[],
  ): Promise<string[]> {
    const keys: string[] = [];
    const guard = new GuardClass(
      { get: () => rules } as unknown as Reflector,
      { resolve: () => '1.2.3.4' } as unknown as ClientIpResolver,
      {
        hit: (key: string) => {
          keys.push(key);
          return Promise.resolve({ count: 1, resetAt: 0 });
        },
      },
      { now: () => 0 },
      { rateLimit: { limitOverrides: {} } } as unknown as IAppConfig,
      { accountSubjectOf: () => undefined, isAnonymousRequest: () => false },
    );
    const context = {
      getHandler: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ body: { email: 'a@b.c' } }) as Request }),
    } as unknown as ExecutionContext;
    await guard.canActivate(context);
    return keys;
  }

  it('counts only IP-keyed rules in the IP guard', async () => {
    const keys = await countedKeys(IpThrottleGuard, [OTHER_RULE, emailRule]);
    expect(keys).toEqual(['b:ip:1.2.3.4']);
  });

  it('counts only the other rules in the account guard', async () => {
    const keys = await countedKeys(AccountThrottleGuard, [OTHER_RULE, emailRule]);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^c:email:/);
  });

  it('counts every rule in the plain guard', async () => {
    expect(await countedKeys(ThrottleGuard, [OTHER_RULE, emailRule])).toHaveLength(2);
  });
});
