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

import { ClientIpResolver } from '../../../../common/http/client-ip.resolver';
import { ID_PARAM } from '../../../../common/constants/api.constants';
import {
  ACCESS_RATE_LIMIT_POLICIES,
  ACCOUNTS_ROUTES,
} from '../../http/AccessHttp.constants';
import { NO_STORE_HEADER } from '../../../../common/constants/http.constants';
import { Throttle } from '../../../../common/guards/throttle.guard';
import { PermissionAction } from '../../domain/Access.constants';
import { clientMetaOf } from '../../../../common/http/client-meta';
import { type AuthenticatedRequest, JwtAuthGuard } from '../../../identity';
import {
  inviteAccountSchema,
  updateAccountSchema,
} from './AccessManagement.requests';
import {
  documentIdSchema,
  pageQuerySchema,
  parseRequest,
} from '../../../../common/http/request-parsing';
import { type AccountView } from '../domain/Account.entity';
import {
  type AccountPage,
  AccountsService,
} from '../application/Accounts.service';
import {
  InvitationsService,
  type InvitedAccountView,
} from '../application/Invitations.service';
import {
  PermissionGuard,
  RequirePermission,
} from '../../http/Permission.guard';
import { requireAccountActor } from '../../domain/Rank.rules';

const SUBJECT = 'accounts';

/**
 * SPEC §9 accounts. The guard checks the `accounts` permission; the
 * service enforces D6 (target rank below the actor's, never itself).
 */
@Controller(ACCOUNTS_ROUTES.ROOT)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly invitations: InvitationsService,
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

  /** Invite: 201 with the account; the invitee gets an emailed code. */
  @Post()
  @RequirePermission({ action: PermissionAction.create, subject: SUBJECT })
  @Throttle(ACCESS_RATE_LIMIT_POLICIES.ACCOUNT_INVITE)
  invite(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<InvitedAccountView> {
    return this.invitations.invite(
      requireAccountActor(req.user.actor),
      parseRequest(inviteAccountSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Patch(ACCOUNTS_ROUTES.BY_ID)
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

  @Post(ACCOUNTS_ROUTES.DISABLE)
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

  @Post(ACCOUNTS_ROUTES.ENABLE)
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

  /** Needs `accounts:create`, like the invite it repeats. */
  @Post(ACCOUNTS_ROUTES.RESEND_INVITE)
  @HttpCode(HttpStatus.OK)
  @RequirePermission({ action: PermissionAction.create, subject: SUBJECT })
  @Throttle(ACCESS_RATE_LIMIT_POLICIES.ACCOUNT_INVITE)
  resendInvite(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
  ): Promise<{ invitationSent: boolean }> {
    return this.invitations.resendInvite(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Post(ACCOUNTS_ROUTES.REVOKE_SESSIONS)
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
