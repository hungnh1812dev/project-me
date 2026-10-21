import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { API_ROUTES } from '../../common/constants/api.constants';
import { NO_STORE_HEADER } from '../../common/constants/auth.constants';
import { RATE_LIMIT_POLICIES } from '../../common/constants/limits.constants';
import { Throttle } from '../../common/guards/throttle.guard';
import { PermissionAction } from '../../generated/prisma/client';
import { MEDIA_SUBJECT } from '../access/access.constants';
import {
  pageQuerySchema,
  parseRequest,
} from '../access/access-management.requests';
import { RequirePermission } from '../access/permission.decorator';
import { PermissionGuard } from '../access/permission.guard';
import { requireAccountActor } from '../access/rank-rules';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../identity/jwt.strategy';
import { type MediaPage, MediaService, type MediaView } from './media.service';

/**
 * SPEC §9 media (T27). JWT sessions only (a reviewer session joins at T32).
 * `PermissionGuard` needs `media` create / read. The multipart body is read
 * by `UploadPipeline` straight from the request, never buffered whole.
 */
@Controller(API_ROUTES.MEDIA.ROOT)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** `multipart/form-data`: one `file` part, optional `alt` text field. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle(RATE_LIMIT_POLICIES.MEDIA_UPLOAD)
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
}
