import {
  Controller,
  Get,
  Body,
  Delete,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import {
  API_ROUTES,
  DOCUMENT_ID_PARAM,
  SLUG_PARAM,
} from '../../common/constants/api.constants';
import { Throttle } from '../../common/guards/throttle.guard';
import { RATE_LIMIT_POLICIES } from '../../common/constants/limits.constants';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import { PermissionAction } from '../../generated/prisma/client';
import {
  documentIdSchema,
  parseRequest,
} from '../../common/http/request-parsing';
import {
  RequirePermission,
  PermissionGuard,
  type SerializedRecord,
} from '../access';
import {
  DEFAULT_DOCUMENT_STATUS,
  DOCUMENT_QUERY_KEYS,
} from './documents.constants';
import { CONTENT_STATUSES } from '../content-engine';
import {
  DocumentAuthGuard,
  type DocumentRequest,
} from '../access/document-auth';
import { parseListQuery } from './dto/list-documents.query';
import {
  parseCreateBody,
  parsePublishBody,
  parseUpdateBody,
} from './dto/write-document.body';
import {
  DocumentsCommandService,
  type WriteResult,
  type WrittenRef,
} from './documents.command.service';
import { parsePresenceBody } from './dto/presence.body';
import { type PresenceEntry, PresenceService } from './presence.service';
import { PublishService } from './publish.service';
import {
  type DocumentPage,
  DocumentsQueryService,
} from './documents.query.service';

const detailQuerySchema = z.strictObject({
  [DOCUMENT_QUERY_KEYS.STATUS]: z
    .enum(CONTENT_STATUSES)
    .optional()
    .transform((value) => value ?? DEFAULT_DOCUMENT_STATUS),
});

/**
 * SPEC §9 document reads (T20). `DocumentAuthGuard` accepts a JWT session,
 * an API token or no credentials (the `public` role); `PermissionGuard`
 * then needs `read` on the `:slug` content type. Bodies are
 * `SerializedRecord`s only: field masking happens in the service.
 */
@Controller(API_ROUTES.DOCUMENTS.ROOT)
@UseGuards(DocumentAuthGuard, PermissionGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsQueryService,
    private readonly commands: DocumentsCommandService,
    private readonly publishing: PublishService,
    private readonly presence: PresenceService,
  ) {}

  @Get(API_ROUTES.DOCUMENTS.BY_SLUG)
  @Throttle(RATE_LIMIT_POLICIES.DOCUMENT_READ_ANONYMOUS)
  @RequirePermission({
    action: PermissionAction.read,
    subjectParam: SLUG_PARAM,
  })
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  list(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Query() query: unknown,
  ): Promise<DocumentPage> {
    return this.documents.list(req.user.actor, slug, parseListQuery(query));
  }

  @Get(API_ROUTES.DOCUMENTS.BY_ID)
  @Throttle(RATE_LIMIT_POLICIES.DOCUMENT_READ_ANONYMOUS)
  @RequirePermission({
    action: PermissionAction.read,
    subjectParam: SLUG_PARAM,
  })
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  get(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Param(DOCUMENT_ID_PARAM) documentId: string,
    @Query() query: unknown,
  ): Promise<SerializedRecord> {
    const { status } = parseRequest(detailQuerySchema, query);
    return this.documents.get(
      req.user.actor,
      slug,
      parseRequest(documentIdSchema, documentId),
      status,
    );
  }

  /** SPEC §9: creates the draft (version 1). `PermissionGuard` needs `create` on `:slug`. */
  @Post(API_ROUTES.DOCUMENTS.BY_SLUG)
  @RequirePermission({
    action: PermissionAction.create,
    subjectParam: SLUG_PARAM,
  })
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  create(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Body() body: unknown,
  ): Promise<WriteResult> {
    return this.commands.create(req.user.actor, slug, parseCreateBody(body));
  }

  /** SPEC §9: update with optimistic concurrency; a stale `version` is a 409 with the masked conflict body. */
  @Put(API_ROUTES.DOCUMENTS.BY_ID)
  @RequirePermission({
    action: PermissionAction.update,
    subjectParam: SLUG_PARAM,
  })
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  update(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Param(DOCUMENT_ID_PARAM) documentId: string,
    @Body() body: unknown,
  ): Promise<WriteResult> {
    const { version, tree } = parseUpdateBody(body);
    return this.commands.update(
      req.user.actor,
      slug,
      parseRequest(documentIdSchema, documentId),
      version,
      tree,
    );
  }

  /** SPEC §9: copies the draft over the published row; a stale `expectedVersion` is a 409. */
  @Post(API_ROUTES.DOCUMENTS.PUBLISH)
  @HttpCode(HttpStatus.OK)
  @RequirePermission({
    action: PermissionAction.publish,
    subjectParam: SLUG_PARAM,
  })
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  publish(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Param(DOCUMENT_ID_PARAM) documentId: string,
    @Body() body: unknown,
  ): Promise<WrittenRef> {
    return this.publishing.publish(
      req.user.actor,
      slug,
      parseRequest(documentIdSchema, documentId),
      parsePublishBody(body),
    );
  }

  /** SPEC §9: removes the published row; the draft stays. */
  @Post(API_ROUTES.DOCUMENTS.UNPUBLISH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({
    action: PermissionAction.unpublish,
    subjectParam: SLUG_PARAM,
  })
  unpublish(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Param(DOCUMENT_ID_PARAM) documentId: string,
  ): Promise<void> {
    return this.publishing.unpublish(
      req.user.actor,
      slug,
      parseRequest(documentIdSchema, documentId),
    );
  }

  /** SPEC §9: removes the draft and the published row. */
  @Delete(API_ROUTES.DOCUMENTS.BY_ID)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({
    action: PermissionAction.delete,
    subjectParam: SLUG_PARAM,
  })
  remove(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Param(DOCUMENT_ID_PARAM) documentId: string,
  ): Promise<void> {
    return this.publishing.remove(
      req.user.actor,
      slug,
      parseRequest(documentIdSchema, documentId),
    );
  }

  /**
   * SPEC D16: heartbeat of an editor; returns who is active on the document
   * (`{accountId, displayName, state, lastSeenAt}` each). Needs `update` on `:slug`.
   */
  @Post(API_ROUTES.DOCUMENTS.PRESENCE)
  @HttpCode(HttpStatus.OK)
  @RequirePermission({
    action: PermissionAction.update,
    subjectParam: SLUG_PARAM,
  })
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  heartbeat(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Param(DOCUMENT_ID_PARAM) documentId: string,
    @Body() body: unknown,
  ): Promise<PresenceEntry[]> {
    return this.presence.heartbeat(
      req.user.actor,
      slug,
      parseRequest(documentIdSchema, documentId),
      parsePresenceBody(body),
    );
  }
}
