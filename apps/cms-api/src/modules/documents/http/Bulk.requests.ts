import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { ERROR_CODES } from '../../../common/constants/error.constants';
import {
  documentIdSchema,
  parseRequest,
} from '../../../common/http/request-parsing';
import {
  BULK_LIMITS,
  type BulkRequest,
  BULK_MESSAGES,
  DOCUMENT_ERROR_CODES,
  DOCUMENT_ERROR_MESSAGES,
  type PublishItem,
} from '../domain/Documents.constants';
import {
  BULK_BODY_KEYS,
  EXPECTED_VERSION_BODY_KEY,
} from './DocumentsHttp.constants';
import { INT4_MAX } from '../../content-engine';

const envelopeSchema = z.strictObject({
  [BULK_BODY_KEYS.ATOMIC]: z.boolean(),
  [BULK_BODY_KEYS.ITEMS]: z.array(z.unknown()).min(1),
});

function envelope(body: unknown): BulkRequest<unknown> {
  const parsed = parseRequest(envelopeSchema, body);
  if (parsed[BULK_BODY_KEYS.ITEMS].length > BULK_LIMITS.MAX_ITEMS) {
    throw new BadRequestException({
      errorCode: DOCUMENT_ERROR_CODES.BULK_LIMIT,
      message: BULK_MESSAGES.TOO_MANY_ITEMS,
    });
  }
  return {
    atomic: parsed[BULK_BODY_KEYS.ATOMIC],
    items: parsed[BULK_BODY_KEYS.ITEMS],
  };
}

/** `bulk/create`: the items are document trees, checked one by one by the service. */
export function parseBulkCreateBody(body: unknown): BulkRequest<unknown> {
  return envelope(body);
}

const publishItemSchema = z.strictObject({
  [BULK_BODY_KEYS.DOCUMENT_ID]: documentIdSchema,
  [EXPECTED_VERSION_BODY_KEY]: z.int().min(1).max(INT4_MAX),
});
const documentItemSchema = z.strictObject({
  [BULK_BODY_KEYS.DOCUMENT_ID]: documentIdSchema,
});

function assertDistinct(ids: readonly string[]): void {
  if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
    throw new BadRequestException({
      errorCode: ERROR_CODES.BAD_REQUEST,
      message: DOCUMENT_ERROR_MESSAGES.BULK_DUPLICATE_DOCUMENT,
    });
  }
}

export function parseBulkPublishBody(body: unknown): BulkRequest<PublishItem> {
  const { atomic, items } = envelope(body);
  const parsed = items.map((item) => parseRequest(publishItemSchema, item));
  assertDistinct(parsed.map((item) => item.documentId));
  return { atomic, items: parsed };
}

/** `bulk/unpublish` and `bulk/delete`: document ids only. */
export function parseBulkDocumentsBody(body: unknown): BulkRequest<string> {
  const { atomic, items } = envelope(body);
  const ids = items.map(
    (item) => parseRequest(documentItemSchema, item).documentId,
  );
  assertDistinct(ids);
  return { atomic, items: ids };
}
