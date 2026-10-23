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

import { ClientIpResolver } from '../../common/client-ip.resolver';
import { API_ROUTES } from '../../common/constants/api.constants';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import { RATE_LIMIT_POLICIES } from '../../common/constants/limits.constants';
import { Throttle } from '../../common/guards/throttle.guard';
import { clientMetaOf } from '../../common/http/client-meta';
import { OwnerSetupService, SetupClosedError } from './owner-setup.service';

/**
 * One-time owner setup (ADR 0005). Public: there is no account yet. Closed
 * (no token configured, or an owner exists), the submit route answers exactly
 * like an unknown route. No cookie and no access token in any answer.
 */
@Controller(API_ROUTES.SETUP.ROOT)
export class OwnerSetupController {
  constructor(
    private readonly setup: OwnerSetupService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  @Get(API_ROUTES.SETUP.STATUS)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(RATE_LIMIT_POLICIES.SETUP_STATUS)
  async status(): Promise<{ open: boolean }> {
    return { open: await this.setup.isOpen() };
  }

  @Post(API_ROUTES.SETUP.OWNER)
  @HttpCode(HttpStatus.CREATED)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(RATE_LIMIT_POLICIES.SETUP_SUBMIT)
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
