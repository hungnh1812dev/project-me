import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ClientIpResolver } from '../../common/client-ip.resolver';
import { API_ROUTES, ID_PARAM } from '../../common/constants/api.constants';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import { PermissionAction } from '../../generated/prisma/client';
import { clientMetaOf } from '../../common/http/client-meta';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../identity/jwt.strategy';
import {
  createRoleSchema,
  replacePermissionsSchema,
  updateRoleSchema,
} from './access-management.requests';
import {
  documentIdSchema,
  parseRequest,
} from '../../common/http/request-parsing';
import { RequirePermission } from './permission.decorator';
import { PermissionGuard } from './permission.guard';
import { requireAccountActor } from './rank-rules';
import { type RoleView, RolesService } from './roles.service';

const SUBJECT = 'roles';

/**
 * SPEC §9 roles (T17). The guard checks the `roles` permission; the
 * service enforces D6 (role rank below the actor's) and system-role rules.
 */
@Controller(API_ROUTES.ROLES.ROOT)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  @Get()
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @RequirePermission({ action: PermissionAction.read, subject: SUBJECT })
  async list(@Req() req: AuthenticatedRequest): Promise<{ data: RoleView[] }> {
    return { data: await this.roles.list(requireAccountActor(req.user.actor)) };
  }

  @Post()
  @RequirePermission({ action: PermissionAction.create, subject: SUBJECT })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<RoleView> {
    return this.roles.create(
      requireAccountActor(req.user.actor),
      parseRequest(createRoleSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Patch(API_ROUTES.ROLES.BY_ID)
  @RequirePermission({ action: PermissionAction.update, subject: SUBJECT })
  update(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
    @Body() body: unknown,
  ): Promise<RoleView> {
    return this.roles.update(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      parseRequest(updateRoleSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }

  @Delete(API_ROUTES.ROLES.BY_ID)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({ action: PermissionAction.delete, subject: SUBJECT })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
  ): Promise<void> {
    return this.roles.remove(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      clientMetaOf(this.clientIp, req),
    );
  }

  /** Replaces the whole set: `{ permissions: [...] }` (T14 row shape). */
  @Put(API_ROUTES.ROLES.PERMISSIONS)
  @RequirePermission({ action: PermissionAction.update, subject: SUBJECT })
  replacePermissions(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
    @Body() body: unknown,
  ): Promise<RoleView> {
    return this.roles.replacePermissions(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      parseRequest(replacePermissionsSchema, body).permissions,
      clientMetaOf(this.clientIp, req),
    );
  }
}
