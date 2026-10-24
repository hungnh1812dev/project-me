import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { type z } from 'zod';

import { ClientIpResolver } from '../../common/http/client-ip.resolver';
import { PASSWORD_ROUTES } from './identity.routes';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
} from './identity-auth.constants';
import { IDENTITY_RATE_LIMIT_POLICIES } from './identity.rate-limits.constants';
import { Throttle } from '../../common/guards/throttle.guard';
import { clientMetaOf } from '../../common/http/client-meta';
import { requireAccountActor } from '../access';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt.strategy';
import {
  changePasswordSchema,
  requestOtpSchema,
  resetPasswordSchema,
  setPasswordSchema,
} from './password.requests';
import { PasswordService } from './password.service';

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      errorCode: AUTH_ERROR_CODES.INVALID_REQUEST,
      message: AUTH_ERROR_MESSAGES.INVALID_PASSWORD_REQUEST,
    });
  }
  return parsed.data;
}

/**
 * SPEC §9 password endpoints. None of them signs the user in: after a
 * reset, set or change every session is gone and the user logs in again.
 */
@Controller(PASSWORD_ROUTES.ROOT)
export class PasswordController {
  constructor(
    private readonly passwords: PasswordService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  /** Always 202 with an empty body, known email or not (D8). */
  @Post(PASSWORD_ROUTES.REQUEST_OTP)
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.OTP_REQUEST)
  requestOtp(@Body() body: unknown, @Req() req: Request): void {
    this.passwords.requestOtp(
      parseBody(requestOtpSchema, body).email,
      clientMetaOf(this.clientIp, req),
    );
  }

  @Post(PASSWORD_ROUTES.RESET)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.PASSWORD_SUBMIT)
  reset(@Body() body: unknown, @Req() req: Request): Promise<void> {
    return this.passwords.reset(
      parseBody(resetPasswordSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Post(PASSWORD_ROUTES.SET)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.PASSWORD_SUBMIT)
  set(@Body() body: unknown, @Req() req: Request): Promise<void> {
    return this.passwords.set(
      parseBody(setPasswordSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Post(PASSWORD_ROUTES.CHANGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @UseGuards(JwtAuthGuard)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.PASSWORD_CHANGE)
  change(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<void> {
    requireAccountActor(req.user.actor);
    return this.passwords.change(
      req.user.accountId,
      parseBody(changePasswordSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }
}
