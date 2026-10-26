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
import { z } from 'zod';

import { NO_STORE_HEADER } from '../../../common/constants/http.constants';
import { DomainError } from '../../../common/errors/Domain.errors';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/DomainErrorKinds.constants';
import { Throttle } from '../../../common/guards/throttle.guard';
import { ClientIpResolver } from '../../../common/http/client-ip.resolver';
import {
  type ClientMeta,
  clientMetaOf,
} from '../../../common/http/client-meta';
import { AccessPolicyService } from '../../access';
import {
  AuthService,
  type CurrentAccountProfile,
} from '../application/Auth.service';
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  REFRESH_TOKEN_TTL_MS,
} from '../domain/Identity.constants';
import { invalidRefreshToken } from '../domain/Identity.errors';
import { AllowedOriginGuard } from './AllowedOrigin.guard';
import {
  AUTH_ROUTES,
  IDENTITY_RATE_LIMIT_POLICIES,
  REFRESH_COOKIE,
  REFRESH_COOKIE_OPTIONS,
} from './IdentityHttp.constants';
import { type AuthenticatedRequest, JwtAuthGuard } from './Jwt.strategy';

/**
 * `POST /auth/login` body. Shape checks only: the email format is not
 * validated (an unknown email simply fails like a wrong password), and the
 * password cap keeps Argon2id cost bounded.
 */
const loginRequestSchema = z.object({
  email: z.string().trim().min(1).max(EMAIL_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

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

/** A 401 from the use case, or from a guard in front of it. */
function isRefusedRefresh(error: unknown): boolean {
  return (
    error instanceof UnauthorizedException ||
    (error instanceof DomainError &&
      error.kind === DOMAIN_ERROR_KINDS.UNAUTHENTICATED)
  );
}

/**
 * SPEC §9 auth endpoints. There is no register route (invite-only), so
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

    const loginOutcome = await this.auth.login(
      parsed.data,
      this.clientMeta(req),
    );
    if (loginOutcome.kind === 'two-factor') {
      return {
        requires2FA: true,
        tempToken: loginOutcome.tempToken,
        methods: loginOutcome.methods,
      };
    }
    setRefreshCookie(res, loginOutcome.refreshToken);
    return { accessToken: loginOutcome.accessToken };
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
      // Grace: no new token, the cookie keeps the successor.
      if (tokens.refreshToken !== undefined) {
        setRefreshCookie(res, tokens.refreshToken);
      }
      return { accessToken: tokens.accessToken };
    } catch (error) {
      // A refused token is dead for good: drop it from the browser too.
      if (isRefusedRefresh(error)) clearRefreshCookie(res);
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
