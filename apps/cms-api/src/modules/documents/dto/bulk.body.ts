import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { ERROR_CODES } from '../../../common/constants/error.constants';
import {
  documentIdSchema,
  parseRequest,
} from '../../../common/http/request-parsing';
import {
  BULK_BODY_KEYS,
  BULK_LIMITS,
  BULK_MESSAGES,
  DOCUMENT_ERROR_CODES,
  DOCUMENT_ERROR_MESSAGES,
  EXPECTED_VERSION_BODY_KEY,
} from '../documents.constants';
import { INT4_MAX } from '../../content-engine';

export interface BulkRequest<Item> {
  atomic: boolean;
  items: Item[];
}

export interface PublishItem {
  documentId: string;
  expectedVersion: number;
}

/** Component nesting past this is rejected by the tree check anyway; stop counting here. */
const COUNT_MAX_DEPTH = 8;

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

/** Component rows in a raw create item (every item of every component list, nested). */
export function countComponentRows(item: unknown, depth = 0): number {
  if (typeof item !== 'object' || item === null || depth > COUNT_MAX_DEPTH) {
    return 0;
  }
  const components = (item as { components?: unknown }).components;
  if (typeof components !== 'object' || components === null) return 0;
  let total = 0;
  for (const list of Object.values(components)) {
    if (!Array.isArray(list)) continue;
    for (const child of list) total += 1 + countComponentRows(child, depth + 1);
  }
  return total;
}
