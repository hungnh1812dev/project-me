import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { DOMAIN_ERROR_KINDS, DomainError } from '../../../common/errors/Domain.errors';
import type { ClientIpResolver } from '../../../common/http/ClientIp.resolver';
import type { AccessPolicyService } from '../../access';
import type { AuthService } from '../application/Auth.service';
import { REFRESH_TOKEN_TTL_MS } from '../domain/Identity.constants';
import { invalidRefreshToken } from '../domain/Identity.errors';
import { AuthController, setRefreshCookie } from './Auth.controller';
import { REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS } from './IdentityHttp.constants';

const RAW_TOKEN = 'raw-refresh-token';

function setup(refresh: jest.Mock) {
  const clearCookie = jest.fn();
  const cookie = jest.fn();
  const controller = new AuthController(
    { refresh } as unknown as AuthService,
    { resolve: () => 'unknown' } as unknown as ClientIpResolver,
    {} as AccessPolicyService,
  );
  const req = {
    cookies: { [REFRESH_COOKIE.NAME]: RAW_TOKEN },
    get: () => undefined,
  } as unknown as Request;
  const res = { clearCookie, cookie } as unknown as Response;
  return { controller, req, res, clearCookie, cookie };
}

describe('AuthController.refresh cookie handling', () => {
  it('clears the refresh cookie when the use case refuses the token', async () => {
    const { controller, req, res, clearCookie } = setup(
      jest.fn().mockRejectedValue(invalidRefreshToken()),
    );

    await expect(controller.refresh(req, res)).rejects.toBeInstanceOf(DomainError);
    expect(clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE.NAME, REFRESH_COOKIE_OPTIONS);
  });

  it('clears it for a Nest 401 as well', async () => {
    const { controller, req, res, clearCookie } = setup(
      jest.fn().mockRejectedValue(new UnauthorizedException()),
    );

    await expect(controller.refresh(req, res)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(clearCookie).toHaveBeenCalledTimes(1);
  });

  it('keeps the cookie for a refusal that is not a 401', async () => {
    const { controller, req, res, clearCookie } = setup(
      jest.fn().mockRejectedValue(new DomainError({ kind: DOMAIN_ERROR_KINDS.UNAVAILABLE })),
    );

    await expect(controller.refresh(req, res)).rejects.toBeInstanceOf(DomainError);
    expect(clearCookie).not.toHaveBeenCalled();
  });

  it('sets the successor cookie and leaves it alone in the grace window', async () => {
    const rotated = setup(
      jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'next', rememberMe: true }),
    );
    await expect(rotated.controller.refresh(rotated.req, rotated.res)).resolves.toEqual({
      accessToken: 'a',
    });
    expect(rotated.cookie).toHaveBeenCalledTimes(1);

    const grace = setup(jest.fn().mockResolvedValue({ accessToken: 'b' }));
    await grace.controller.refresh(grace.req, grace.res);
    expect(grace.cookie).not.toHaveBeenCalled();
    expect(grace.clearCookie).not.toHaveBeenCalled();
  });
});

describe('setRefreshCookie modes', () => {
  it('adds maxAge only for a remembered session', () => {
    const cookie = jest.fn();
    const res = { cookie } as unknown as Response;
    setRefreshCookie(res, 'a', true);
    setRefreshCookie(res, 'b', false);
    expect(cookie).toHaveBeenNthCalledWith(1, REFRESH_COOKIE.NAME, 'a', {
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
    expect(cookie).toHaveBeenNthCalledWith(2, REFRESH_COOKIE.NAME, 'b', REFRESH_COOKIE_OPTIONS);
  });
});
