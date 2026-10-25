import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { ERROR_CODES } from '../../../common/constants/error.constants';
import {
  invalidRequest,
  PAGINATION,
  parseRequest,
  queryInt,
} from '../../../common/http/request-parsing';
import { CONTENT_STATUSES, INT4_MAX } from '../../content-engine';
import {
  DEFAULT_DOCUMENT_STATUS,
  DOCUMENT_ERROR_MESSAGES,
  DOCUMENT_QUERY_LIMITS,
  FILTER_OPERATORS,
  type FilterOperator,
  LIST_QUERY_MESSAGES,
  PRESENCE_STATES,
  type PresenceState,
} from '../domain/Documents.constants';
import {
  type FilterClause,
  type ListDocumentsQuery,
  normalizeListQuery,
  type SortKey,
} from '../domain/ListQuery.rules';
import {
  DOCUMENT_QUERY_KEYS,
  EXPECTED_VERSION_BODY_KEY,
  FILTER_DEFAULT_OPERATOR,
  FILTER_KEY_PATTERN,
  FILTER_KEY_PREFIX,
  SORT_DESCENDING_PREFIX,
  SORT_SEPARATOR,
  VERSION_BODY_KEY,
} from './DocumentsHttp.constants';

type ContentStatus = (typeof CONTENT_STATUSES)[number];

const paramsSchema = z.strictObject({
  [DOCUMENT_QUERY_KEYS.STATUS]: z
    .enum(CONTENT_STATUSES)
    .optional()
    .transform((value): ContentStatus => value ?? DEFAULT_DOCUMENT_STATUS),
  [DOCUMENT_QUERY_KEYS.PAGE]: queryInt(
    PAGINATION.FIRST_PAGE,
    Number.MAX_SAFE_INTEGER,
    PAGINATION.FIRST_PAGE,
  ),
  [DOCUMENT_QUERY_KEYS.PAGE_SIZE]: queryInt(
    1,
    Number.MAX_SAFE_INTEGER,
    PAGINATION.DEFAULT_PAGE_SIZE,
  ),
  [DOCUMENT_QUERY_KEYS.SORT]: z
    .string()
    .max(DOCUMENT_QUERY_LIMITS.MAX_SORT_LENGTH)
    .optional(),
});

const isOperator = (op: string): op is FilterOperator =>
  (FILTER_OPERATORS as readonly string[]).includes(op);

function badFilter(message: string): never {
  throw invalidRequest([{ path: [DOCUMENT_QUERY_KEYS.FILTER], message }]);
}

function parseSort(raw: string | undefined): SortKey[] {
  if (raw === undefined) return [];
  return raw.split(SORT_SEPARATOR).map((part): SortKey => {
    const descending = part.startsWith(SORT_DESCENDING_PREFIX);
    const path = descending ? part.slice(SORT_DESCENDING_PREFIX.length) : part;
    return { path, direction: descending ? 'desc' : 'asc' };
  });
}

function parseFilter(key: string, raw: unknown): FilterClause {
  const match = FILTER_KEY_PATTERN.exec(key);
  const path = match?.[1];
  const op = match?.[2] ?? FILTER_DEFAULT_OPERATOR;
  if (path === undefined) return badFilter(LIST_QUERY_MESSAGES.FILTER_BAD_PATH);
  if (!isOperator(op)) return badFilter('Unknown filter operator.');
  const values = Array.isArray(raw) ? raw : [raw];
  if (!values.every((value): value is string => typeof value === 'string')) {
    return badFilter(LIST_QUERY_MESSAGES.FILTER_BAD_VALUE);
  }
  return { path, op, values };
}

/**
 * Parses the query string of `GET /documents/:slug`. Express 5 hands over a
 * flat map (`filter[title][contains]` is one key), so filters are matched by
 * key. Anything unknown or malformed is a 400 that names the parameter kind,
 * never the submitted value.
 */
export function parseListQuery(query: unknown): ListDocumentsQuery {
  const entries =
    typeof query === 'object' && query !== null ? Object.entries(query) : [];
  const filterEntries = entries.filter(([key]) =>
    key.startsWith(FILTER_KEY_PREFIX),
  );
  const rest = Object.fromEntries(
    entries.filter(([key]) => !key.startsWith(FILTER_KEY_PREFIX)),
  );
  const params = parseRequest(paramsSchema, rest);
  return normalizeListQuery({
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
    sort: parseSort(params.sort),
    filters: filterEntries.map(([key, value]) => parseFilter(key, value)),
  });
}

const versionSchema = z.int().min(1).max(INT4_MAX);

const updateVersionSchema = z.object({ [VERSION_BODY_KEY]: versionSchema });

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException({
      errorCode: ERROR_CODES.BAD_REQUEST,
      message: DOCUMENT_ERROR_MESSAGES.INVALID_BODY,
    });
  }
  return body as Record<string, unknown>;
}

/** `POST` body: the document tree (`{ values?, components? }`); its keys are checked by the write allowlist. */
export function parseCreateBody(body: unknown): Record<string, unknown> {
  return asObject(body);
}

/**
 * `PUT` body: the tree plus the `version` the client edited. `version` is
 * taken out here, so it can never reach the field allowlist or the SQL.
 */
export function parseUpdateBody(body: unknown): {
  version: number;
  tree: Record<string, unknown>;
} {
  const tree = Object.fromEntries(
    Object.entries(asObject(body)).filter(([key]) => key !== VERSION_BODY_KEY),
  );
  const parsed = parseRequest(updateVersionSchema, body);
  return { version: parsed[VERSION_BODY_KEY], tree };
}

const publishBodySchema = z.strictObject({
  [EXPECTED_VERSION_BODY_KEY]: versionSchema,
});

/** `POST .../publish` body: only the draft version being published. */
export function parsePublishBody(body: unknown): number {
  return parseRequest(publishBodySchema, body)[EXPECTED_VERSION_BODY_KEY];
}

const presenceBodySchema = z.strictObject({
  state: z.enum(PRESENCE_STATES).default('editing'),
});

/** `POST .../presence` body: `{ state? }`, nothing else (default `editing`). */
export function parsePresenceBody(body: unknown): PresenceState {
  return parseRequest(presenceBodySchema, body ?? {}).state;
}
