import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { API_ROUTES, SLUG_PARAM } from '../../common/constants/api.constants';
import { NO_STORE_HEADER } from '../../common/constants/auth.constants';
import { PermissionAction } from '../../generated/prisma/client';
import { RequirePermission } from '../access/permission.decorator';
import { PermissionGuard } from '../access/permission.guard';
import { type BulkResponse, BulkService } from './bulk.service';
import { DocumentAuthGuard, type DocumentRequest } from './document-auth.guard';
import {
  parseBulkCreateBody,
  parseBulkDocumentsBody,
  parseBulkPublishBody,
} from './dto/bulk.body';

/**
 * SPEC §9 bulk (T34), collections only. Registered before
 * `DocumentsController` so `bulk` is never read as a document id. Each route
 * needs its action on `:slug` (`PermissionGuard`); rows and fields are then
 * checked per item in `BulkService`.
 */
@Controller(`${API_ROUTES.DOCUMENTS.ROOT}/${API_ROUTES.DOCUMENTS.BULK_PREFIX}`)
@UseGuards(DocumentAuthGuard, PermissionGuard)
export class BulkController {
  constructor(private readonly bulk: BulkService) {}

  @Post(API_ROUTES.DOCUMENTS.BULK_CREATE)
  @HttpCode(HttpStatus.OK)
  @RequirePermission({
    action: PermissionAction.create,
    subjectParam: SLUG_PARAM,
  })
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  create(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Body() body: unknown,
  ): Promise<BulkResponse> {
    return this.bulk.create(req.user.actor, slug, parseBulkCreateBody(body));
  }

  @Post(API_ROUTES.DOCUMENTS.BULK_PUBLISH)
  @HttpCode(HttpStatus.OK)
  @RequirePermission({
    action: PermissionAction.publish,
    subjectParam: SLUG_PARAM,
  })
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  publish(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Body() body: unknown,
  ): Promise<BulkResponse> {
    return this.bulk.publish(req.user.actor, slug, parseBulkPublishBody(body));
  }

  @Post(API_ROUTES.DOCUMENTS.BULK_UNPUBLISH)
  @HttpCode(HttpStatus.OK)
  @RequirePermission({
    action: PermissionAction.unpublish,
    subjectParam: SLUG_PARAM,
  })
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  unpublish(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Body() body: unknown,
  ): Promise<BulkResponse> {
    return this.bulk.unpublish(
      req.user.actor,
      slug,
      parseBulkDocumentsBody(body),
    );
  }

  @Post(API_ROUTES.DOCUMENTS.BULK_DELETE)
  @HttpCode(HttpStatus.OK)
  @RequirePermission({
    action: PermissionAction.delete,
    subjectParam: SLUG_PARAM,
  })
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  remove(
    @Req() req: DocumentRequest,
    @Param(SLUG_PARAM) slug: string,
    @Body() body: unknown,
  ): Promise<BulkResponse> {
    return this.bulk.remove(req.user.actor, slug, parseBulkDocumentsBody(body));
  }
}
