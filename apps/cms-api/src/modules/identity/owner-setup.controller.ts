import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { ClientIpResolver } from '../../common/http/client-ip.resolver';
import { SETUP_ROUTES } from './identity.routes';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import { IDENTITY_RATE_LIMIT_POLICIES } from './identity.rate-limits.constants';
import { Throttle } from '../../common/guards/throttle.guard';
import { clientMetaOf } from '../../common/http/client-meta';
import { OwnerSetupService, SetupClosedError } from './owner-setup.service';

/**
 * One-time owner setup (ADR 0005). Public: there is no account yet. Closed
 * (no token configured, or an owner exists), the submit route answers exactly
 * like an unknown route. No cookie and no access token in any answer.
 */
@Controller(SETUP_ROUTES.ROOT)
export class OwnerSetupController {
  constructor(
    private readonly setup: OwnerSetupService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  @Get(SETUP_ROUTES.STATUS)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.SETUP_STATUS)
  async status(): Promise<{ open: boolean }> {
    return { open: await this.setup.isOpen() };
  }

  @Post(SETUP_ROUTES.OWNER)
  @HttpCode(HttpStatus.CREATED)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(IDENTITY_RATE_LIMIT_POLICIES.SETUP_SUBMIT)
  async createOwner(
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<{ email: string }> {
    try {
      return await this.setup.createOwner(body, {
        ip: clientMetaOf(this.clientIp, req).ip,
      });
    } catch (error) {
      if (error instanceof SetupClosedError) {
        // The same message Nest gives an unknown route.
        throw new NotFoundException(`Cannot ${req.method} ${req.originalUrl}`);
      }
      throw error;
    }
  }
}
