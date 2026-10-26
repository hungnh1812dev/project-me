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

import { SLUG_PARAM } from '../../../common/constants/Api.constants';
import { describeError } from '../../../common/http/DescribeHttpException.rules';
import { DOCUMENTS_ROUTES } from './DocumentsHttp.constants';
import { NO_STORE_HEADER } from '../../../common/constants/Http.constants';
import {
  PermissionAction,
  PermissionGuard,
  RequirePermission,
} from '../../access';
import {
  type BulkItemResult,
  type BulkResponse,
  BulkService,
} from '../application/Bulk.service';
import { BULK_ITEM_STATUS } from '../domain/Documents.constants';
import {
  DocumentAuthGuard,
  type DocumentRequest,
} from '../../access/document-auth';
import {
  parseBulkCreateBody,
  parseBulkDocumentsBody,
  parseBulkPublishBody,
} from './Bulk.requests';

/** One item of the response body; an error item carries what a single request would answer. */
export type BulkItemBody =
  | Exclude<BulkItemResult, { status: typeof BULK_ITEM_STATUS.ERROR }>
  | {
      index: number;
      status: typeof BULK_ITEM_STATUS.ERROR;
      statusCode: number;
      errorCode: string;
      message: string;
      details?: unknown;
    };

export interface BulkResponseBody extends Omit<BulkResponse, 'results'> {
  results: BulkItemBody[];
}

/** A server error is never an item result, so `describeError` here only reads client errors. */
export function toBulkBody(response: BulkResponse): BulkResponseBody {
  return {
    ...response,
    results: response.results.map((result): BulkItemBody => {
      if (result.status !== BULK_ITEM_STATUS.ERROR) return result;
      const { statusCode, errorCode, message, details } = describeError(
        result.error,
      );
      return {
        index: result.index,
        status: result.status,
        statusCode,
        errorCode,
        message,
        ...(details === undefined ? {} : { details }),
      };
    }),
  };
}

/**
 * SPEC §9 bulk, collections only. Registered before
 * `DocumentsController` so `bulk` is never read as a document id. Each route
 * needs its action on `:slug` (`PermissionGuard`); rows and fields are then
 * checked per item in `BulkService`.
 */
@Controller(`${DOCUMENTS_ROUTES.ROOT}/${DOCUMENTS_ROUTES.BULK_PREFIX}`)
@UseGuards(DocumentAuthGuard, PermissionGuard)
export class BulkController {
  constructor(private readonly bulk: BulkService) {}

  @Post(DOCUMENTS_ROUTES.BULK_CREATE)
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
  ): Promise<BulkResponseBody> {
    return this.bulk
      .create(req.user.actor, slug, parseBulkCreateBody(body))
      .then(toBulkBody);
  }

  @Post(DOCUMENTS_ROUTES.BULK_PUBLISH)
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
  ): Promise<BulkResponseBody> {
    return this.bulk
      .publish(req.user.actor, slug, parseBulkPublishBody(body))
      .then(toBulkBody);
  }

  @Post(DOCUMENTS_ROUTES.BULK_UNPUBLISH)
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
  ): Promise<BulkResponseBody> {
    return this.bulk
      .unpublish(req.user.actor, slug, parseBulkDocumentsBody(body))
      .then(toBulkBody);
  }

  @Post(DOCUMENTS_ROUTES.BULK_DELETE)
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
  ): Promise<BulkResponseBody> {
    return this.bulk
      .remove(req.user.actor, slug, parseBulkDocumentsBody(body))
      .then(toBulkBody);
  }
}
