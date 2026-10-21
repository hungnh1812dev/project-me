import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ClientIpResolver } from '../../common/client-ip.resolver';
import { API_ROUTES, ID_PARAM } from '../../common/constants/api.constants';
import { NO_STORE_HEADER } from '../../common/constants/auth.constants';
import { PermissionAction } from '../../generated/prisma/client';
import { clientMetaOf } from '../identity/auth.controller';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../identity/jwt.strategy';
import {
  documentIdSchema,
  pageQuerySchema,
  parseRequest,
} from './access-management.requests';
import {
  type ApiTokenPage,
  type ApiTokenView,
  ApiTokensService,
  type CreatedApiTokenView,
} from './api-tokens.service';
import {
  createApiTokenSchema,
  updateApiTokenSchema,
} from './api-tokens.requests';
import { RequirePermission } from './permission.decorator';
import { PermissionGuard } from './permission.guard';
import { requireAccountActor } from './rank-rules';

const SUBJECT = 'api_tokens';

/**
 * SPEC §9 API tokens (T19). JWT sessions only: `JwtAuthGuard` rejects an
 * `ak_live_` token with 401 and `requireAccountActor` rejects every other
 * actor kind with 403 (D5). The service scopes each call to the caller's
 * own tokens unless they are the Owner.
 */
@Controller(API_ROUTES.API_TOKENS.ROOT)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ApiTokensController {
  constructor(
    private readonly tokens: ApiTokensService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  @Get()
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @RequirePermission({ action: PermissionAction.read, subject: SUBJECT })
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<ApiTokenPage> {
    return this.tokens.list(
      requireAccountActor(req.user.actor),
      parseRequest(pageQuerySchema, query),
    );
  }

  /** 201 with the raw token, shown this once and never stored. */
  @Post()
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @RequirePermission({ action: PermissionAction.create, subject: SUBJECT })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<CreatedApiTokenView> {
    return this.tokens.create(
      requireAccountActor(req.user.actor),
      parseRequest(createApiTokenSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Patch(API_ROUTES.API_TOKENS.BY_ID)
  @RequirePermission({ action: PermissionAction.update, subject: SUBJECT })
  update(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
    @Body() body: unknown,
  ): Promise<ApiTokenView> {
    return this.tokens.update(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      parseRequest(updateApiTokenSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Post(API_ROUTES.API_TOKENS.REVOKE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({ action: PermissionAction.update, subject: SUBJECT })
  revoke(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
  ): Promise<void> {
    return this.tokens.revoke(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      clientMetaOf(this.clientIp, req),
    );
  }
}
