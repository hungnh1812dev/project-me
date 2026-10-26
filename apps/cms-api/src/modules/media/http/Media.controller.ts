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
import { z } from 'zod';

import { ID_PARAM } from '../../../common/constants/api.constants';
import { NO_STORE_HEADER } from '../../../common/constants/http.constants';
import {
  ONE_HOUR_MS,
  RATE_LIMIT_KEY_SOURCES,
  type RateLimitRule,
} from '../../../common/constants/limits.constants';
import { Throttle } from '../../../common/guards/throttle.guard';
import { ClientIpResolver } from '../../../common/http/client-ip.resolver';
import { clientMetaOf } from '../../../common/http/client-meta';
import {
  documentIdSchema,
  pageQuerySchema,
  parseRequest,
} from '../../../common/http/request-parsing';
import type { PageMeta } from '../../../common/validation/SharedSchemas.rules';
import {
  MEDIA_SUBJECT,
  PermissionAction,
  RequirePermission,
  PermissionGuard,
  requireAccountActor,
} from '../../access';
import { type AuthenticatedRequest, JwtAuthGuard } from '../../identity';
import type { MediaRecord, MediaView } from '../domain/Media.entity';
import { isAltWithinLimit, normalizeAlt } from '../domain/MediaUpload.rules';
import type { UploadStream } from '../application/Media.port';
import { MediaLibraryService } from '../application/MediaLibrary.service';
import { UploadMediaService } from '../application/UploadMedia.service';

/** SPEC §9 media (upload, list, delete). */
const MEDIA_ROUTES = {
  ROOT: 'media',
  BY_ID: ':id',
} as const;

export const MEDIA_RATE_LIMIT_POLICIES = {
  /**
   * `POST /media`: uploads re-encode images and call the storage
   * provider, so they are bounded per signed-in caller and per IP. In memory.
   */
  MEDIA_UPLOAD: [
    {
      name: 'media-upload:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 120,
      windowMs: ONE_HOUR_MS,
    },
    {
      name: 'media-upload:actor',
      keySource: RATE_LIMIT_KEY_SOURCES.ACTOR,
      maxHits: 60,
      windowMs: ONE_HOUR_MS,
    },
  ],
} as const satisfies Record<string, readonly RateLimitRule[]>;

/**
 * `PATCH /media/:id`: the alt text only. A blank string or `null` clears it
 * (same rule as the upload's `alt` field); more than 500 characters is 400.
 */
const updateMediaSchema = z.strictObject({
  alt: z
    .string()
    .trim()
    .refine(isAltWithinLimit)
    .transform(normalizeAlt)
    .nullable(),
});

/** The API view of a library file: never the storage key or the internal id. */
function mediaViewOf(record: MediaRecord): MediaView {
  return {
    id: record.documentId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    size: record.size,
    width: record.width,
    height: record.height,
    alt: record.alt,
    url: record.url,
    thumbnailUrl: record.thumbnailUrl,
    provider: record.provider,
    isReviewerPreset: record.isReviewerPreset,
    createdAt: record.createdAt.toISOString(),
  };
}

function uploadStreamOf(req: AuthenticatedRequest): UploadStream {
  const declaredLength = Number(req.headers['content-length']);
  return {
    headers: req.headers,
    declaredLength: Number.isFinite(declaredLength) ? declaredLength : null,
    body: req,
  };
}

/**
 * SPEC §9 media. JWT sessions only.
 * `PermissionGuard` needs `media` create / read. The multipart body is read
 * by `UploadProcessor` straight from the request, never buffered whole.
 */
@Controller(MEDIA_ROUTES.ROOT)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MediaController {
  constructor(
    private readonly library: MediaLibraryService,
    private readonly uploads: UploadMediaService,
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
  async upload(@Req() req: AuthenticatedRequest): Promise<MediaView> {
    const record = await this.uploads.upload(
      requireAccountActor(req.user.actor),
      uploadStreamOf(req),
    );
    return mediaViewOf(record);
  }

  @Get()
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @RequirePermission({ action: PermissionAction.read, subject: MEDIA_SUBJECT })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<{ data: MediaView[]; meta: PageMeta }> {
    const page = await this.library.list(
      req.user.actor,
      parseRequest(pageQuerySchema, query),
    );
    return { data: page.data.map(mediaViewOf), meta: page.meta };
  }

  /** Alt text only (strict body); 404 for an unknown, deleted or out-of-scope file. */
  @Patch(MEDIA_ROUTES.BY_ID)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @RequirePermission({
    action: PermissionAction.update,
    subject: MEDIA_SUBJECT,
  })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param(ID_PARAM) id: string,
    @Body() body: unknown,
  ): Promise<MediaView> {
    const record = await this.library.updateAlt(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      parseRequest(updateMediaSchema, body).alt,
    );
    return mediaViewOf(record);
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
    return this.library.remove(
      requireAccountActor(req.user.actor),
      parseRequest(documentIdSchema, id),
      clientMetaOf(this.clientIp, req),
    );
  }
}
