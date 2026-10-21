import {
  Controller,
  Get,
  Header,
  Param,
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
import { NO_STORE_HEADER } from '../../common/constants/auth.constants';
import { PermissionAction } from '../../generated/prisma/client';
import {
  documentIdSchema,
  parseRequest,
} from '../access/access-management.requests';
import { RequirePermission } from '../access/permission.decorator';
import { PermissionGuard } from '../access/permission.guard';
import type { SerializedRecord } from '../access/record.serializer';
import {
  DEFAULT_DOCUMENT_STATUS,
  DOCUMENT_QUERY_KEYS,
} from './documents.constants';
import { CONTENT_STATUSES } from '../content-engine/content-engine.constants';
import { DocumentAuthGuard, type DocumentRequest } from './document-auth.guard';
import { parseListQuery } from './dto/list-documents.query';
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
  constructor(private readonly documents: DocumentsQueryService) {}

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
}
