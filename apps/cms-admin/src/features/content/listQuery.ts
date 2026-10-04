import { ApiError } from '@/core/api/apiError';

import type { FilterOperator, FilterValue, ListFilters, ListParams } from './types';

/** The D1 backend defaults. A param equal to its default is dropped, so it never reaches the key or URL. */
export const LIST_DEFAULTS = { start: 0, size: 20, orderBy: 'id', sortDir: 'desc' } as const;

/** The largest page size the backend accepts. */
export const MAX_LIST_SIZE = 100;

/** The longest `search` or string filter value sent on the wire (P2-SEC-2). */
export const MAX_LIST_TEXT_LENGTH = 256;

/** A plain identifier: what a field name or `orderBy` may be before wire mapping (P2-SEC-1). */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const FILTER_OPERATORS: ReadonlySet<string> = new Set<FilterOperator>([
  '$eq',
  '$ne',
  '$contains',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
]);

// System columns are camelCase in responses but snake_case on the wire (SPEC AC-4).
const WIRE_FIELDS: Readonly<Record<string, string>> = {
  documentId: 'document_id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  publishedAt: 'published_at',
};

/** Maps a camelCase system column to its snake_case wire name. `id` and schema fields pass through. */
export function toWireField(field: string): string {
  return Object.hasOwn(WIRE_FIELDS, field) ? WIRE_FIELDS[field]! : field;
}

function definedEntries<V>(record: Record<string, V | undefined>): [string, V][] {
  return Object.entries(record).filter((entry): entry is [string, V] => entry[1] !== undefined);
}

function normalizeFilters(filters: ListFilters): ListFilters | undefined {
  const out: ListFilters = {};
  for (const field of Object.keys(filters).sort()) {
    const ops = definedEntries(filters[field] ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
    if (ops.length > 0) out[field] = Object.fromEntries(ops);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Returns the canonical form of list params: undefined values, backend defaults, an empty search and
 * empty filters are dropped, `search` is trimmed, and filter keys are sorted. Equal inputs give
 * deep-equal outputs, so they share one cache key and one URL. Field names are not mapped here.
 */
export function normalizeListParams(params: ListParams): ListParams {
  const out: ListParams = {};
  if (params.start !== undefined && params.start !== LIST_DEFAULTS.start) out.start = params.start;
  if (params.size !== undefined && params.size !== LIST_DEFAULTS.size) out.size = params.size;
  if (params.orderBy !== undefined && params.orderBy !== LIST_DEFAULTS.orderBy) {
    out.orderBy = params.orderBy;
  }
  if (params.sortDir !== undefined && params.sortDir !== LIST_DEFAULTS.sortDir) {
    out.sortDir = params.sortDir;
  }
  const search = params.search?.trim();
  if (search) out.search = search;
  const filters = params.filters && normalizeFilters(params.filters);
  if (filters) out.filters = filters;
  return out;
}

function toWireValue(value: FilterValue): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Serializes normalized list params to the D1 query string: `start`, `size`, `orderBy`, `sortDir`,
 * `search`, then each filter as `filters[<wire field>][<$op>]=<value>` in the given order. System
 * columns in `orderBy` and filter keys use their wire names. Pass the result as axios `params` so
 * axios does not serialize the nested filters itself.
 */
export function toListSearchParams(params: ListParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.start !== undefined) qs.append('start', String(params.start));
  if (params.size !== undefined) qs.append('size', String(params.size));
  if (params.orderBy !== undefined) qs.append('orderBy', toWireField(params.orderBy));
  if (params.sortDir !== undefined) qs.append('sortDir', params.sortDir);
  if (params.search !== undefined) qs.append('search', params.search);
  for (const [field, ops] of Object.entries(params.filters ?? {})) {
    for (const [op, value] of definedEntries(ops)) {
      qs.append(`filters[${toWireField(field)}][${op}]`, toWireValue(value));
    }
  }
  return qs;
}

function isIntegerIn(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Returns every rule the list params break (an empty list when they are valid): `start` must be an
 * integer ≥ 0, `size` an integer 1–100, `sortDir` `asc` or `desc`, `orderBy` and each filter field a
 * plain identifier (`IDENTIFIER`), the trimmed `search` and each string filter value at most
 * `MAX_LIST_TEXT_LENGTH` characters, and each filter field must have exactly one known operator.
 * Undefined values are ignored.
 */
export function validateListParams(params: ListParams): string[] {
  const problems: string[] = [];
  const { start, size, orderBy, sortDir, search } = params;
  if (start !== undefined && !isIntegerIn(start, 0, Number.MAX_SAFE_INTEGER)) {
    problems.push(`start must be an integer ≥ 0 (got ${String(start)})`);
  }
  if (size !== undefined && !isIntegerIn(size, 1, MAX_LIST_SIZE)) {
    problems.push(`size must be an integer from 1 to ${MAX_LIST_SIZE} (got ${String(size)})`);
  }
  if (sortDir !== undefined && sortDir !== 'asc' && sortDir !== 'desc') {
    problems.push(`sortDir must be "asc" or "desc" (got ${JSON.stringify(sortDir)})`);
  }
  if (orderBy !== undefined && !IDENTIFIER.test(orderBy)) {
    problems.push(`orderBy must be a plain field name (got ${JSON.stringify(orderBy)})`);
  }
  if (search !== undefined && search.trim().length > MAX_LIST_TEXT_LENGTH) {
    problems.push(`search must be at most ${MAX_LIST_TEXT_LENGTH} characters`);
  }
  for (const [field, ops] of Object.entries(params.filters ?? {})) {
    if (!IDENTIFIER.test(field)) {
      problems.push(`filter field must be a plain field name (got ${JSON.stringify(field)})`);
    }
    const entries = definedEntries(ops ?? {});
    const names = entries.map(([op]) => op);
    for (const op of names) {
      if (!FILTER_OPERATORS.has(op)) problems.push(`unknown filter operator ${op} on ${field}`);
    }
    for (const [op, value] of entries) {
      if (typeof value === 'string' && value.length > MAX_LIST_TEXT_LENGTH) {
        problems.push(`${field} ${op} value must be at most ${MAX_LIST_TEXT_LENGTH} characters`);
      }
    }
    if (names.length > 1) {
      problems.push(
        `only one filter operator is allowed per field (${field} has ${names.join(', ')})`,
      );
    }
  }
  return problems;
}

/** The client-side 400 for invalid list params. The list query rejects with it and sends no request. */
export function listValidationError(problems: string[]): ApiError {
  return new ApiError({
    status: 400,
    code: 'ERR_CLIENT_VALIDATION',
    message: problems.join(', '),
    messages: problems,
  });
}
