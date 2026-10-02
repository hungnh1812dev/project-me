import type { Route } from '@playwright/test';

import type { MeUser } from '../../src/features/auth/types.ts';
import type {
  ContentType,
  ContentTypeSummary,
  Document,
  ListedDocumentItem,
} from '../../src/features/content/types.ts';

/** Seeds the fake content backend that `mockApi` delegates `/content-types*` and `/documents*` to. */
export interface MockContent {
  /** Adds (or replaces) a content type, served by C1 and C2. */
  addContentType(type: ContentType): void;
  /** Adds a collection-type document, served by D1. Its `id` is assigned in insertion order. */
  addDocument(slug: string, doc: Document): void;
  /** Sets the single type's document for S1. `null` means never saved (S1 answers 404). */
  setSingle(slug: string, doc: Document | null): void;
}

/** One content request, as `mockApi` hands it over. */
export interface ContentRequest {
  method: string;
  /** The path below `/api/v1`, without the query string. */
  path: string;
  query: URLSearchParams;
  /** The bearer token's user, or `null` when the token is missing or expired. */
  user: MeUser | null;
}

/** Answers a content request and returns its status, or `null` when the path is not modelled. */
export type ContentHandler = (route: Route, request: ContentRequest) => Promise<number | null>;

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
};

// Wire names (snake_case) of the system columns a list can be sorted or filtered by.
const SYSTEM_COLUMNS: Record<string, keyof ListedDocumentItem> = {
  id: 'id',
  document_id: 'documentId',
  status: 'status',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

async function reply(route: Route, status: number, body: unknown): Promise<number> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  return status;
}

function fail(route: Route, status: number, message: string): Promise<number> {
  return reply(route, status, { statusCode: status, message, error: STATUS_TEXT[status] });
}

/**
 * The backend's permission check: an exact match, `<res>:manager` for `<res>:read`, and a global
 * `document:<action>` for a scoped `document:<action>:<slug>`.
 */
function granted(user: MeUser, required: string): boolean {
  const permissions = user.role?.permissions ?? [];
  if (permissions.includes(required)) return true;
  const [resource, action, scope] = required.split(':');
  if (action === 'read' && permissions.includes(`${resource}:manager`)) return true;
  return (
    resource === 'document' && scope !== undefined && permissions.includes(`document:${action}`)
  );
}

function summary(type: ContentType): ContentTypeSummary {
  return { slug: type.slug, name: type.name, kind: type.kind, draftToPublish: type.draftToPublish };
}

// camelCase system columns: never part of a list row's `data`.
const SYSTEM_FIELDS = new Set([
  'id',
  'documentId',
  'status',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'updatedBy',
]);

/** The D1 row: system columns beside `data`, which is projected down to `listFields`. */
function toListed(id: number, doc: Document, listFields: string[]): ListedDocumentItem {
  const { documentId, status, createdAt, updatedAt, updatedBy } = doc;
  const data = Object.fromEntries(
    listFields.filter((field) => field in doc && !SYSTEM_FIELDS.has(field)).map((f) => [f, doc[f]]),
  );
  return { id, documentId, status, createdAt, updatedAt, updatedBy, data };
}

function fieldValue(item: ListedDocumentItem, wireField: string): unknown {
  const system = SYSTEM_COLUMNS[wireField];
  return system ? item[system] : item.data[wireField];
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

const FILTER_KEY = /^filters\[([^\]]+)\]\[(\$[a-z]+)\]$/;

/** Applies `filters[field][$eq|$ne|$contains]`, `orderBy`, `sortDir`, `start` and `size`. */
function listPage(items: ListedDocumentItem[], query: URLSearchParams) {
  let rows = items;
  for (const [key, value] of query) {
    const match = FILTER_KEY.exec(key);
    if (!match) continue;
    const [, field, op] = match;
    rows = rows.filter((item) => {
      const actual = String(fieldValue(item, field!));
      if (op === '$eq') return actual === value;
      if (op === '$ne') return actual !== value;
      if (op === '$contains') return actual.toLowerCase().includes(value.toLowerCase());
      return true;
    });
  }
  const orderBy = query.get('orderBy') ?? 'id';
  const direction = query.get('sortDir') === 'asc' ? 1 : -1;
  rows = [...rows].sort(
    (a, b) => direction * compare(fieldValue(a, orderBy), fieldValue(b, orderBy)),
  );
  const start = Number(query.get('start') ?? 0);
  const size = Number(query.get('size') ?? 20);
  return { items: rows.slice(start, start + size), total: rows.length, start, size };
}

/**
 * An in-test content backend for C1, C2, S1 and D1. It answers 401 without a valid bearer user,
 * 403 when the user lacks `content_type:read` or the scoped (or global) `document:read`, and 404 for
 * an unknown slug or a never-saved single type.
 */
export function createMockContent(): { content: MockContent; handle: ContentHandler } {
  const types = new Map<string, ContentType>();
  const documents = new Map<string, Document[]>();
  const singles = new Map<string, Document | null>();

  const content: MockContent = {
    addContentType(type) {
      types.set(type.slug, type);
    },
    addDocument(slug, doc) {
      documents.set(slug, [...(documents.get(slug) ?? []), doc]);
    },
    setSingle(slug, doc) {
      singles.set(slug, doc);
    },
  };

  const handle: ContentHandler = async (route, { method, path, query, user }) => {
    const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
    const isContentTypes = segments[0] === 'content-types';
    const isDocuments = segments[0] === 'documents';
    if (method !== 'GET' || (!isContentTypes && !isDocuments)) return null;
    if (!user) return fail(route, 401, 'Unauthorized');

    if (isContentTypes) {
      if (segments.length > 2) return null;
      if (!granted(user, 'content_type:read')) return fail(route, 403, 'Forbidden resource');
      if (segments.length === 1) return reply(route, 200, [...types.values()].map(summary));
      const type = types.get(segments[1]!);
      return type ? reply(route, 200, type) : fail(route, 404, 'Content type not found');
    }

    const [, kind, slug] = segments;
    if (segments.length !== 3 || (kind !== 'single-type' && kind !== 'collection-type')) {
      return null;
    }
    if (!granted(user, `document:read:${slug}`)) return fail(route, 403, 'Forbidden resource');
    const type = types.get(slug!);
    if (!type || type.kind !== (kind === 'single-type' ? 'single' : 'collection')) {
      return fail(route, 404, 'Content type not found');
    }

    if (kind === 'single-type') {
      const doc = singles.get(slug!) ?? null;
      return doc ? reply(route, 200, { data: doc }) : fail(route, 404, 'Document not found');
    }
    const items = (documents.get(slug!) ?? []).map((doc, i) =>
      toListed(i + 1, doc, type.listFields),
    );
    return reply(route, 200, listPage(items, query));
  };

  return { content, handle };
}
