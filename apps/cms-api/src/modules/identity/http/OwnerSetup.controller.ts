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

import { NO_STORE_HEADER } from '../../../common/constants/http.constants';
import { Throttle } from '../../../common/guards/throttle.guard';
import { ClientIpResolver } from '../../../common/http/client-ip.resolver';
import { clientMetaOf } from '../../../common/http/client-meta';
import { parseRequest } from '../../../common/http/request-parsing';
import {
  ownerInputSchema,
  type OwnerBootstrapInput,
} from '../application/OwnerBootstrap.service';
import {
  OwnerSetupService,
  SetupClosedError,
} from '../application/OwnerSetup.service';
import {
  IDENTITY_RATE_LIMIT_POLICIES,
  SETUP_ROUTES,
} from './IdentityHttp.constants';

/** The setup token is read apart (it is checked before anything else). */
function parseOwnerSetupBody(body: unknown): OwnerBootstrapInput {
  return parseRequest(ownerInputSchema, body);
}

/** The submitted token, if the body carries a non-empty string under it. */
function submittedSetupToken(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return undefined;
  return (body as Record<string, unknown>).setupToken;
}

/**
 * One-time owner setup (ADR 0005). Public: there is no account yet. Closed
 * (no token configured, or an owner exists), the submit route answers exactly
 * like an unknown route. No cookie and no access token in any answer. The
 * setup token is checked before the rest of the body is read.
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
    const meta = { ip: clientMetaOf(this.clientIp, req).ip };
    try {
      await this.setup.admit(submittedSetupToken(body), meta);
      return await this.setup.createOwner(parseOwnerSetupBody(body), meta);
    } catch (error) {
      if (error instanceof SetupClosedError) {
        // The same message Nest gives an unknown route.
        throw new NotFoundException(`Cannot ${req.method} ${req.originalUrl}`);
      }
      throw error;
    }
  }
}
