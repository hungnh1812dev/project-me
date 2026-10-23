import {
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  Req,
  Res,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import { GRAPHQL_ROUTE } from './graphql.routes';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import { ERROR_CODES } from '../../common/constants/error.constants';
import { Throttle } from '../../common/guards/throttle.guard';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import { parseRequest } from '../../common/http/request-parsing';
import {
  DocumentAuthGuard,
  type DocumentRequest,
} from '../access/document-auth';
import { DOCUMENTS_RATE_LIMIT_POLICIES } from '../documents';
import {
  GRAPHQL_MESSAGES,
  GRAPHQL_REQUEST_MEDIA_TYPE,
} from './graphql.constants';
import { GraphqlExecutor, type GraphqlResponse } from './graphql.executor';

/** Unknown keys (e.g. `extensions`) are ignored; an array body is not an object. */
const requestSchema = z.object({
  query: z.string().min(1),
  variables: z.record(z.string(), z.unknown()).nullish(),
  operationName: z.string().nullish(),
});

/**
 * SPEC D18 `POST /graphql`: queries over the document read path.
 * `DocumentAuthGuard` accepts a JWT, an API token or no credentials (the
 * `public` role), then the anonymous throttle counts the request once. There
 * is no `PermissionGuard`: the subject differs per root field, so access is
 * decided per field by validation and by `DocumentsQueryService`.
 */
@Controller(GRAPHQL_ROUTE)
@UseGuards(DocumentAuthGuard)
export class GraphqlController {
  constructor(private readonly executor: GraphqlExecutor) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle(DOCUMENTS_RATE_LIMIT_POLICIES.DOCUMENT_READ_ANONYMOUS)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  async query(
    @Req() req: DocumentRequest & RequestWithId,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ): Promise<GraphqlResponse['body']> {
    if (!req.is(GRAPHQL_REQUEST_MEDIA_TYPE)) {
      throw new UnsupportedMediaTypeException({
        errorCode: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        message: GRAPHQL_MESSAGES.UNSUPPORTED_MEDIA_TYPE,
      });
    }
    const request = parseRequest(requestSchema, body);
    const result = await this.executor.run(
      req.user.actor,
      request,
      req.requestId,
    );
    res.status(result.status);
    return result.body;
  }
}
