import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type z } from 'zod';

import { ClientIpResolver } from '../../common/http/client-ip.resolver';
import { TWO_FACTOR_ROUTES } from './identity.routes';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
} from './identity-auth.constants';
import { IDENTITY_RATE_LIMIT_POLICIES } from './identity.rate-limits.constants';
import { Throttle } from '../../common/guards/throttle.guard';
import { type AccessTokenResponse, setRefreshCookie } from './auth.controller';
import { clientMetaOf } from '../../common/http/client-meta';
import { requireAccountActor } from '../access';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt.strategy';
import {
  disableTwoFactorSchema,
  emailChallengeSchema,
  enableTwoFactorSchema,
  verifyTwoFactorSchema,
} from './two-factor.requests';
import { type TotpSetupResponse, TwoFactorService } from './two-factor.service';

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      errorCode: AUTH_ERROR_CODES.INVALID_REQUEST,
      message: AUTH_ERROR_MESSAGES.INVALID_TWO_FACTOR_REQUEST,
    });
  }
  return parsed.data;
}

/**
 * SPEC §9 two-factor endpoints. `verify` and `email-challenge` take
 * the temp token from `POST /auth/login`; the rest need a Bearer token.
 * Re-auth failures of signed-in calls answer 403.
 */
@Controller(TWO_FACTOR_ROUTES.ROOT)
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  @Post(TWO_FACTOR_ROUTES.TOTP_SETUP)
  @HttpCode(HttpStatus.OK)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @UseGuards(JwtAuthGuard)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.TWO_FACTOR_MANAGE)
  setupTotp(@Req() req: AuthenticatedRequest): Promise<TotpSetupResponse> {
    requireAccountActor(req.user.actor);
    return this.twoFactor.setupTotp(req.user.accountId);
  }

  @Post(TWO_FACTOR_ROUTES.ENABLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.TWO_FACTOR_MANAGE)
  enable(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<void> {
    requireAccountActor(req.user.actor);
    return this.twoFactor.enable(
      req.user.accountId,
      parseBody(enableTwoFactorSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Post(TWO_FACTOR_ROUTES.DISABLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.TWO_FACTOR_MANAGE)
  disable(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<void> {
    requireAccountActor(req.user.actor);
    return this.twoFactor.disable(
      req.user.accountId,
      parseBody(disableTwoFactorSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Post(TWO_FACTOR_ROUTES.EMAIL_SEND_CODE)
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.TWO_FACTOR_EMAIL_CHALLENGE)
  sendEmailCode(@Req() req: AuthenticatedRequest): Promise<void> {
    requireAccountActor(req.user.actor);
    return this.twoFactor.sendEmailCode(
      req.user.accountId,
      clientMetaOf(this.clientIp, req),
    );
  }

  /** Same response as a password-only login: access token + refresh cookie. */
  @Post(TWO_FACTOR_ROUTES.VERIFY)
  @HttpCode(HttpStatus.OK)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.TWO_FACTOR_VERIFY)
  async verify(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    const tokens = await this.twoFactor.verifyLogin(
      parseBody(verifyTwoFactorSchema, body),
      clientMetaOf(this.clientIp, req),
    );
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  /** 202 with an empty body; a TOTP account gets no email. */
  @Post(TWO_FACTOR_ROUTES.EMAIL_CHALLENGE)
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.TWO_FACTOR_EMAIL_CHALLENGE)
  emailChallenge(@Body() body: unknown, @Req() req: Request): Promise<void> {
    return this.twoFactor.emailChallenge(
      parseBody(emailChallengeSchema, body).tempToken,
      clientMetaOf(this.clientIp, req),
    );
  }
}
