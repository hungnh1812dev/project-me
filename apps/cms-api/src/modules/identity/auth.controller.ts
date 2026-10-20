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
import type { CookieOptions, Request, Response } from 'express';

import { ClientIpResolver } from '../../common/client-ip.resolver';
import { API_ROUTES } from '../../common/constants/api.constants';
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  NO_STORE_HEADER,
  REFRESH_COOKIE,
  REFRESH_TOKEN_TTL_MS,
  USER_AGENT_HEADER,
} from '../../common/constants/auth.constants';
import {
  RATE_LIMIT_POLICIES,
  UNKNOWN_CLIENT_IP,
} from '../../common/constants/limits.constants';
import { Throttle } from '../../common/guards/throttle.guard';
import { AllowedOriginGuard } from './allowed-origin.guard';
import {
  AuthService,
  type CurrentAccountProfile,
  invalidRefreshToken,
} from './auth.service';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt.strategy';
import { loginRequestSchema } from './login.request';
import { type ClientMeta } from './refresh-token.service';

/** SPEC §6 attributes. No `domain`: the cookie must stay host-only. */
const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: REFRESH_COOKIE.HTTP_ONLY,
  secure: REFRESH_COOKIE.SECURE,
  sameSite: REFRESH_COOKIE.SAME_SITE,
  path: REFRESH_COOKIE.PATH,
};

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

/** User agent and client IP stored with a new refresh token. */
export function clientMetaOf(
  clientIp: ClientIpResolver,
  req: Request,
): ClientMeta {
  const ip = clientIp.resolve(req);
  return {
    userAgent: req.get(USER_AGENT_HEADER),
    ip: ip === UNKNOWN_CLIENT_IP ? undefined : ip,
  };
}

/**
 * SPEC §9 auth endpoints. There is no register route (Q2 invite-only), so
 * `POST /auth/register` is a plain 404. The refresh cookie is read only by
 * `refresh` and `logout` (D14), both behind the Origin allowlist.
 */
@Controller(API_ROUTES.AUTH.ROOT)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  @Post(API_ROUTES.AUTH.LOGIN)
  @HttpCode(HttpStatus.OK)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(RATE_LIMIT_POLICIES.LOGIN)
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

  @Post(API_ROUTES.AUTH.REFRESH)
  @HttpCode(HttpStatus.OK)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @UseGuards(AllowedOriginGuard)
  @Throttle(RATE_LIMIT_POLICIES.REFRESH)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    const rawToken = refreshCookieOf(req);
    if (rawToken === undefined) throw invalidRefreshToken();
    try {
      const tokens = await this.auth.refresh(rawToken, this.clientMeta(req));
      setRefreshCookie(res, tokens.refreshToken);
      return { accessToken: tokens.accessToken };
    } catch (error) {
      // A refused token is dead for good: drop it from the browser too.
      if (error instanceof UnauthorizedException) clearRefreshCookie(res);
      throw error;
    }
  }

  @Post(API_ROUTES.AUTH.LOGOUT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AllowedOriginGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(refreshCookieOf(req));
    clearRefreshCookie(res);
  }

  @Get(API_ROUTES.AUTH.ME)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest): Promise<CurrentAccountProfile> {
    return this.auth.me(req.user.accountId);
  }

  private clientMeta(req: Request): ClientMeta {
    return clientMetaOf(this.clientIp, req);
  }
}
