import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ClientIpResolver } from '../../common/http/client-ip.resolver';
import { AUTH_ROUTES } from './identity.routes';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  REFRESH_COOKIE,
  REFRESH_COOKIE_OPTIONS,
  REFRESH_TOKEN_TTL_MS,
} from './identity-auth.constants';
import { IDENTITY_RATE_LIMIT_POLICIES } from './identity.rate-limits.constants';
import { type ClientMeta, clientMetaOf } from '../../common/http/client-meta';
import { Throttle } from '../../common/guards/throttle.guard';
import { AccessPolicyService } from '../access';
import { AllowedOriginGuard } from './allowed-origin.guard';
import {
  AuthService,
  type CurrentAccountProfile,
  invalidRefreshToken,
} from './auth.service';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt.strategy';
import { loginRequestSchema } from './login.request';

export interface AccessTokenResponse {
  accessToken: string;
}

export interface TwoFactorRequiredResponse {
  requires2FA: true;
  tempToken: string;
  methods: readonly string[];
}

function refreshCookieOf(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE.NAME];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Sets the refresh cookie of a new session (login, 2FA verify, refresh). */
export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE.NAME, token, {
    ...REFRESH_COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE.NAME, REFRESH_COOKIE_OPTIONS);
}

/**
 * SPEC §9 auth endpoints. There is no register route (Q2 invite-only), so
 * `POST /auth/register` is a plain 404. The refresh cookie is read only by
 * `refresh` and `logout` (D14), both behind the Origin allowlist.
 */
@Controller(AUTH_ROUTES.ROOT)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly clientIp: ClientIpResolver,
    private readonly access: AccessPolicyService,
  ) {}

  @Post(AUTH_ROUTES.LOGIN)
  @HttpCode(HttpStatus.OK)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.LOGIN)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse | TwoFactorRequiredResponse> {
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        errorCode: AUTH_ERROR_CODES.INVALID_REQUEST,
        message: AUTH_ERROR_MESSAGES.INVALID_REQUEST,
      });
    }

    const result = await this.auth.login(parsed.data, this.clientMeta(req));
    if (result.kind === 'two-factor') {
      return {
        requires2FA: true,
        tempToken: result.tempToken,
        methods: result.methods,
      };
    }
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post(AUTH_ROUTES.REFRESH)
  @HttpCode(HttpStatus.OK)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @UseGuards(AllowedOriginGuard)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.REFRESH)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    const rawToken = refreshCookieOf(req);
    if (rawToken === undefined) throw invalidRefreshToken();
    try {
      const tokens = await this.auth.refresh(rawToken, this.clientMeta(req));
      // Grace (T11a): no new token, the cookie keeps the successor.
      if (tokens.refreshToken !== undefined) {
        setRefreshCookie(res, tokens.refreshToken);
      }
      return { accessToken: tokens.accessToken };
    } catch (error) {
      // A refused token is dead for good: drop it from the browser too.
      if (error instanceof UnauthorizedException) clearRefreshCookie(res);
      throw error;
    }
  }

  @Post(AUTH_ROUTES.LOGOUT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AllowedOriginGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(refreshCookieOf(req), this.clientMeta(req));
    clearRefreshCookie(res);
  }

  @Get(AUTH_ROUTES.ME)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: AuthenticatedRequest): Promise<CurrentAccountProfile> {
    const profile = await this.auth.me(req.user.accountId);
    const { evaluator } = await this.access.policy();
    return {
      ...profile,
      permissions: evaluator.effectivePermissions(req.user.actor),
    };
  }

  private clientMeta(req: Request): ClientMeta {
    return clientMetaOf(this.clientIp, req);
  }
}
