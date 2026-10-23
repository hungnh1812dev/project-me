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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ClientIpResolver } from '../../common/http/client-ip.resolver';
import { ID_PARAM } from '../../common/constants/api.constants';
import { MEDIA_ROUTES } from './media.routes';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import { MEDIA_RATE_LIMIT_POLICIES } from './media.rate-limits.constants';
import { Throttle } from '../../common/guards/throttle.guard';
import { PermissionAction } from '../../generated/prisma/client';
import {
  MEDIA_SUBJECT,
  RequirePermission,
  PermissionGuard,
  requireAccountActor,
} from '../access';
import {
  documentIdSchema,
  pageQuerySchema,
  parseRequest,
} from '../../common/http/request-parsing';
import { type AuthenticatedRequest, JwtAuthGuard } from '../identity';
import { clientMetaOf } from '../../common/http/client-meta';
import { updateMediaSchema } from './media.requests';
import { MediaDeleteService } from './media-delete.service';
import { MediaUpdateService } from './media-update.service';
import { type MediaPage, MediaService, type MediaView } from './media.service';

/**
 * SPEC §9 media (T27). JWT sessions only (a reviewer session joins at T32).
 * `PermissionGuard` needs `media` create / read. The multipart body is read
 * by `UploadPipeline` straight from the request, never buffered whole.
 */
@Controller(MEDIA_ROUTES.ROOT)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly mediaDelete: MediaDeleteService,
    private readonly mediaUpdate: MediaUpdateService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  /** `multipart/form-data`: one `file` part, optional `alt` text field. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle(MEDIA_RATE_LIMIT_POLICIES.MEDIA_UPLOAD)
  @RequirePermission({
    action: PermissionAction.create,
    subject: MEDIA_SUBJECT,
  })
  upload(@Req() req: AuthenticatedRequest): Promise<MediaView> {
    return this.media.upload(requireAccountActor(req.user.actor), req);
  }

  @Get()
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @RequirePermission({ action: PermissionAction.read, subject: MEDIA_SUBJECT })
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<MediaPage> {
    return this.media.list(
      req.user.actor,
      parseRequest(pageQuerySchema, query),
    );
  }

  /** Alt text only (strict body); 404 for an unknown, deleted or out-of-scope file. */
  @Patch(MEDIA_ROUTES.BY_ID)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @RequirePermission({
    action: PermissionAction.update,
    subject: MEDIA_SUBJECT,
  })
  update(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
    @Body() body: unknown,
  ): Promise<MediaView> {
    return this.mediaUpdate.update(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      parseRequest(updateMediaSchema, body),
    );
  }

  /** Soft delete; 409 `MEDIA_IN_USE` while a document references the file. */
  @Delete(MEDIA_ROUTES.BY_ID)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({
    action: PermissionAction.delete,
    subject: MEDIA_SUBJECT,
  })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
  ): Promise<void> {
    return this.mediaDelete.remove(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      clientMetaOf(this.clientIp, req),
    );
  }
}
