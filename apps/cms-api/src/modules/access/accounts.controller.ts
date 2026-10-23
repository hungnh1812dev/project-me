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
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import { RATE_LIMIT_POLICIES } from '../../common/constants/limits.constants';
import { Throttle } from '../../common/guards/throttle.guard';
import { PermissionAction } from '../../generated/prisma/client';
import { clientMetaOf } from '../../common/http/client-meta';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../identity/jwt.strategy';
import {
  inviteAccountSchema,
  updateAccountSchema,
} from './access-management.requests';
import {
  documentIdSchema,
  pageQuerySchema,
  parseRequest,
} from '../../common/http/request-parsing';
import {
  type AccountPage,
  type AccountView,
  AccountsService,
  type InvitedAccountView,
} from './accounts.service';
import { RequirePermission } from './permission.decorator';
import { PermissionGuard } from './permission.guard';
import { requireAccountActor } from './rank-rules';

const SUBJECT = 'accounts';

/**
 * SPEC §9 accounts (T17). The guard checks the `accounts` permission; the
 * service enforces D6 (target rank below the actor's, never itself).
 */
@Controller(API_ROUTES.ACCOUNTS.ROOT)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  @Get()
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @RequirePermission({ action: PermissionAction.read, subject: SUBJECT })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<AccountPage> {
    const actor = requireAccountActor(req.user.actor);
    return this.accounts.list(actor, parseRequest(pageQuerySchema, query));
  }

  /** Invite (Q2): 201 with the account; the invitee gets an emailed code. */
  @Post()
  @RequirePermission({ action: PermissionAction.create, subject: SUBJECT })
  @Throttle(RATE_LIMIT_POLICIES.ACCOUNT_INVITE)
  invite(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<InvitedAccountView> {
    return this.accounts.invite(
      requireAccountActor(req.user.actor),
      parseRequest(inviteAccountSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Patch(API_ROUTES.ACCOUNTS.BY_ID)
  @RequirePermission({ action: PermissionAction.update, subject: SUBJECT })
  update(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
    @Body() body: unknown,
  ): Promise<AccountView> {
    return this.accounts.update(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      parseRequest(updateAccountSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Post(API_ROUTES.ACCOUNTS.DISABLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({ action: PermissionAction.update, subject: SUBJECT })
  disable(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
  ): Promise<void> {
    return this.accounts.disable(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Post(API_ROUTES.ACCOUNTS.ENABLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({ action: PermissionAction.update, subject: SUBJECT })
  enable(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
  ): Promise<void> {
    return this.accounts.enable(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      clientMetaOf(this.clientIp, req),
    );
  }

  /** Q8: needs `accounts:create`, like the invite it repeats. */
  @Post(API_ROUTES.ACCOUNTS.RESEND_INVITE)
  @HttpCode(HttpStatus.OK)
  @RequirePermission({ action: PermissionAction.create, subject: SUBJECT })
  @Throttle(RATE_LIMIT_POLICIES.ACCOUNT_INVITE)
  resendInvite(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
  ): Promise<{ invitationSent: boolean }> {
    return this.accounts.resendInvite(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Post(API_ROUTES.ACCOUNTS.REVOKE_SESSIONS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({ action: PermissionAction.update, subject: SUBJECT })
  revokeSessions(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
  ): Promise<void> {
    return this.accounts.revokeSessions(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      clientMetaOf(this.clientIp, req),
    );
  }
}
