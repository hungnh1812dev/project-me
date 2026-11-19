import { Logger, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { DomainError } from '../../../common/errors/Domain.errors';
import type { ClientIpResolver } from '../../../common/http/ClientIp.resolver';
import type { HumanCheckService } from '../application/HumanCheck.service';
import {
  HUMAN_CHECK_FORMS,
  humanCheckFailed,
  type HumanCheckForm,
} from '../domain/HumanCheck.rules';
import { HumanCheckGuard } from './HumanCheck.guard';

type AssertPassed = jest.Mock<Promise<void>, [string, unknown, string | undefined]>;

function assertPassedMock(implementation: () => Promise<void>): AssertPassed {
  return jest.fn<Promise<void>, [string, unknown, string | undefined]>(implementation);
}

const SECRET_TOKEN = 'token-that-must-not-be-logged';

function contextOf(body: unknown): ExecutionContext {
  const request = { body, method: 'POST', route: { path: '/auth/login' }, get: () => undefined };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardWith(
  formId: HumanCheckForm | undefined,
  assertPassed: AssertPassed,
  resolvedIp = '203.0.113.9',
) {
  const reflector = { getAllAndOverride: () => formId } as unknown as Reflector;
  const clientIp = { resolve: () => resolvedIp } as unknown as ClientIpResolver;
  return new HumanCheckGuard(reflector, { assertPassed } as unknown as HumanCheckService, clientIp);
}

describe('HumanCheckGuard', () => {
  let warn: jest.SpyInstance<void, [message: unknown, ...optionalParams: unknown[]]>;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('reads turnstileToken from the body and the form id from the route metadata', async () => {
    const assertPassed = assertPassedMock(() => Promise.resolve());
    const guard = guardWith(HUMAN_CHECK_FORMS.TWO_FACTOR, assertPassed);
    await expect(
      guard.canActivate(contextOf({ turnstileToken: SECRET_TOKEN, email: 'a@b.test' })),
    ).resolves.toBe(true);
    expect(assertPassed).toHaveBeenCalledWith('two-factor', SECRET_TOKEN, '203.0.113.9');
  });

  it('passes an unknown client IP as undefined', async () => {
    const assertPassed = assertPassedMock(() => Promise.resolve());
    await guardWith(HUMAN_CHECK_FORMS.LOGIN, assertPassed, 'unknown').canActivate(contextOf({}));
    expect(assertPassed.mock.calls[0]?.[2]).toBeUndefined();
  });

  it.each([undefined, null, 'text', 7, []])(
    'hands the service no token for body %j',
    async (body) => {
      const assertPassed = assertPassedMock(() => Promise.resolve());
      await guardWith(HUMAN_CHECK_FORMS.LOGIN, assertPassed).canActivate(contextOf(body));
      expect(assertPassed.mock.calls[0]?.[1]).toBeUndefined();
    },
  );

  it('rethrows a refusal and logs only the route and the error code', async () => {
    const assertPassed = assertPassedMock(() => Promise.reject(humanCheckFailed()));
    const guard = guardWith(HUMAN_CHECK_FORMS.LOGIN, assertPassed);
    await expect(
      guard.canActivate(contextOf({ turnstileToken: SECRET_TOKEN })),
    ).rejects.toBeInstanceOf(DomainError);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0]?.[0]);
    expect(logged).toContain('POST /auth/login');
    expect(logged).toContain('HUMAN_CHECK_FAILED');
    expect(logged).not.toContain(SECRET_TOKEN);
  });

  it('refuses a route that has no form id', async () => {
    const guard = guardWith(
      undefined,
      assertPassedMock(() => Promise.resolve()),
    );
    await expect(guard.canActivate(contextOf({}))).rejects.toThrow(/RequireHumanCheck/);
  });
});
