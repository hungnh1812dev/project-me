import type { Route } from '@playwright/test';

import type { MeUser } from '../../src/features/auth/types.ts';
import type {
  ContentType,
  ContentTypeSummary,
  Document,
  FieldDefinition,
  ListedDocumentItem,
} from '../../src/features/content/types.ts';

/** One save body the mock received: S2 and D4 (`PUT`) and D2 (`POST`), including refused ones. */
export interface ContentSave {
  route: 'S2' | 'D2' | 'D4';
  slug: string;
  /** The D4 target. Absent for S2 and D2. */
  documentId?: string;
  /** The raw JSON body, `{ data }` when the client follows the contract. */
  body: unknown;
}

/** Seeds and inspects the fake content backend that `mockApi` delegates `/content-types*` and `/documents*` to. */
export interface MockContent {
  /** Adds (or replaces) a content type, served by C1 and C2. */
  addContentType(type: ContentType): void;
  /** Adds a collection-type document. Its list `id` is assigned in insertion order. */
  addDocument(slug: string, doc: Document): void;
  /** Sets the single type's document for S1. `null` means never saved (S1 answers 404). */
  setSingle(slug: string, doc: Document | null): void;
  /** Every S2, D2 and D4 body, in order, including the ones answered with 400. */
  readonly saves: ContentSave[];
  /** Every D5 and D10 delete of `documentId` fails from now on: D10 lists it in `failed` with `error`, D5 answers 500. */
  failDelete(documentId: string, error?: string): void;
  /** The collection's current documents, in insertion order. */
  documents(slug: string): Document[];
  /** The single type's current document: `null` when never saved, `undefined` when unknown. */
  single(slug: string): Document | null | undefined;
  /** The content type as it is now (C3 changes `listFields`). */
  contentType(slug: string): ContentType | undefined;
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
  500: 'Internal Server Error',
};

const MODE_B = 'Draft-to-publish is disabled for this content type';
const DOCUMENT_NOT_FOUND = 'Document not found';
const TYPE_NOT_FOUND = 'Content type not found';
const MAX_BULK = 100;

async function reply(route: Route, status: number, body: unknown): Promise<number> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  return status;
}

function fail(route: Route, status: number, message: string | string[]): Promise<number> {
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

// camelCase system columns: never part of a list row's `data`, and never accepted in a save.
const SYSTEM_FIELDS = new Set([
  'id',
  'documentId',
  'status',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'updatedBy',
]);

// The listable system columns C3 accepts beside text/number/boolean fields.
const LISTABLE_SYSTEM = SYSTEM_FIELDS;

const SCALAR_TYPES = new Set(['text', 'number', 'boolean']);

const RANGE = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte'];
const EQUALITY = ['$eq', '$ne'];

// Wire names (snake_case) of the system columns, with their sort and filter rules.
const WIRE_SYSTEM: Record<string, { key: string; sortable: boolean; operators: string[] }> = {
  id: { key: 'id', sortable: true, operators: EQUALITY },
  document_id: { key: 'documentId', sortable: false, operators: EQUALITY },
  created_at: { key: 'createdAt', sortable: true, operators: RANGE },
  updated_at: { key: 'updatedAt', sortable: true, operators: RANGE },
  published_at: { key: 'publishedAt', sortable: true, operators: RANGE },
};

const FIELD_OPERATORS: Record<string, string[]> = {
  text: ['$eq', '$ne', '$contains'],
  number: RANGE,
  boolean: EQUALITY,
};

/** A collection document as stored: the list `id` and the publish time live beside it. */
interface Stored {
  id: number;
  doc: Document;
  publishedAt: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every problem with `value` for `field`, prefixed with its dotted path. */
function checkField(field: FieldDefinition, value: unknown, path: string): string[] {
  if (value === null || value === undefined) return [];
  switch (field.type) {
    case 'text':
    case 'richtext':
      return typeof value === 'string' ? [] : [`${path} must be a string`];
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? []
        : [`${path} must be a number`];
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path} must be a boolean`];
    case 'media':
      return isObject(value) || typeof value === 'string' ? [] : [`${path} must be a media asset`];
    case 'component': {
      const fields = field.fields ?? [];
      if (field.repeatable) {
        if (!Array.isArray(value)) return [`${path} must be an array`];
        return value.flatMap((entry, i) =>
          isObject(entry)
            ? checkData(fields, entry, `${path}.${i}.`, null)
            : [`${path}.${i} must be an object`],
        );
      }
      return isObject(value)
        ? checkData(fields, value, `${path}.`, null)
        : [`${path} must be an object`];
    }
    default:
      // json and types this mock doesn't know accept any value.
      return [];
  }
}

/**
 * The 400 messages for `data` against `fields`: each value must fit its field's type, and at the
 * top level (`slug` given) an unknown key, such as a system field, is rejected too.
 */
function checkData(
  fields: FieldDefinition[],
  data: Record<string, unknown>,
  prefix: string,
  slug: string | null,
): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    const field = fields.find((f) => f.name === key);
    if (field) problems.push(...checkField(field, value, `${prefix}${key}`));
    else if (slug !== null) problems.push(`${prefix}${key} is not a field of ${slug}`);
  }
  return problems;
}

/** The `data` of a `{ data }` body and its problems. */
function readSave(type: ContentType, body: unknown, prefix = '') {
  const data = isObject(body) ? body.data : undefined;
  if (!isObject(data)) return { data: {}, problems: [`${prefix}data must be an object`] };
  return { data, problems: checkData(type.fields, data, prefix, type.slug) };
}

const now = () => new Date().toISOString();

function editor(user: MeUser) {
  return { documentId: user.documentId, name: user.name };
}

/** The schema fields of a document: everything but the system fields. */
function dynamicFields(doc: Document): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !SYSTEM_FIELDS.has(key)));
}

/** The D1 row: system columns beside `data`, which is projected down to `listFields`. */
function toListed(stored: Stored, listFields: string[]): ListedDocumentItem {
  const { documentId, status, createdAt, updatedAt, updatedBy } = stored.doc;
  const data = Object.fromEntries(
    listFields
      .filter((field) => field in stored.doc && !SYSTEM_FIELDS.has(field))
      .map((f) => [f, stored.doc[f]]),
  );
  return { id: stored.id, documentId, status, createdAt, updatedAt, updatedBy, data };
}

function fieldValue(stored: Stored, wireField: string): unknown {
  if (wireField === 'id') return stored.id;
  if (wireField === 'published_at') return stored.publishedAt;
  const system = WIRE_SYSTEM[wireField];
  return system ? stored.doc[system.key] : stored.doc[wireField];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string' && ISO_DATE.test(a) && ISO_DATE.test(b)) {
    return Date.parse(a) - Date.parse(b);
  }
  return String(a ?? '').localeCompare(String(b ?? ''));
}

/** Compares a stored value with a filter's string value, by the stored value's type. */
function compareFilter(actual: unknown, value: string): number {
  if (typeof actual === 'number') return actual - Number(value);
  return compare(actual, value);
}

const FILTER_KEY = /^filters\[([^\]]+)\]\[(\$[a-z]+)\]$/;

/** The D1 rules: `orderBy` and filter fields must be allowlisted, `size` 1–100. */
function checkQuery(type: ContentType, query: URLSearchParams): string[] {
  const problems: string[] = [];
  const field = (name: string) =>
    type.fields.find((f) => f.name === name && SCALAR_TYPES.has(f.type));
  const orderBy = query.get('orderBy');
  if (orderBy !== null && !WIRE_SYSTEM[orderBy]?.sortable && !field(orderBy)) {
    problems.push(`orderBy ${orderBy} is not sortable`);
  }
  const size = query.get('size');
  if (size !== null && !(Number(size) >= 1 && Number(size) <= MAX_BULK)) {
    problems.push('size must be from 1 to 100');
  }
  for (const key of query.keys()) {
    if (!key.startsWith('filters')) continue;
    const match = FILTER_KEY.exec(key);
    const [, name = '', op = ''] = match ?? [];
    const operators = WIRE_SYSTEM[name]?.operators ?? FIELD_OPERATORS[field(name)?.type ?? ''];
    if (!match || !operators?.includes(op)) problems.push(`filter ${key} is not allowed`);
  }
  return problems;
}

/** Applies `search`, `filters[field][$op]`, `orderBy`, `sortDir`, `start` and `size`. */
function listPage(type: ContentType, stored: Stored[], query: URLSearchParams) {
  let rows = stored;
  const search = query.get('search')?.toLowerCase();
  if (search) {
    const searchable = type.fields
      .filter(
        (f) => (f.type === 'text' || f.type === 'richtext') && type.listFields.includes(f.name),
      )
      .map((f) => f.name);
    rows = rows.filter((row) =>
      searchable.some((name) =>
        String(row.doc[name] ?? '')
          .toLowerCase()
          .includes(search),
      ),
    );
  }
  for (const [key, value] of query) {
    const match = FILTER_KEY.exec(key);
    if (!match) continue;
    const [, field, op] = match;
    rows = rows.filter((row) => {
      const actual = fieldValue(row, field!);
      switch (op) {
        case '$eq':
          return String(actual) === value;
        case '$ne':
          return String(actual) !== value;
        case '$contains':
          return String(actual ?? '')
            .toLowerCase()
            .includes(value.toLowerCase());
        case '$gt':
          return actual != null && compareFilter(actual, value) > 0;
        case '$gte':
          return actual != null && compareFilter(actual, value) >= 0;
        case '$lt':
          return actual != null && compareFilter(actual, value) < 0;
        default:
          return actual != null && compareFilter(actual, value) <= 0;
      }
    });
  }
  const orderBy = query.get('orderBy') ?? 'id';
  const direction = query.get('sortDir') === 'asc' ? 1 : -1;
  rows = [...rows].sort(
    (a, b) => direction * compare(fieldValue(a, orderBy), fieldValue(b, orderBy)) || b.id - a.id,
  );
  const start = Number(query.get('start') ?? 0);
  const size = Number(query.get('size') ?? 20);
  const items = rows.slice(start, start + size).map((row) => toListed(row, type.listFields));
  return { items, total: rows.length, start, size };
}

type DocumentRoute =
  'S1' | 'S2' | 'S3' | 'S4' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8' | 'D9' | 'D10';

interface RouteRule {
  row: DocumentRoute;
  /** The document actions it needs, each scoped to the slug. */
  actions: string[];
}

// `<method> <shape>` per kind, where the shape is the path below the slug with the id as `:id`.
const DOCUMENT_ROUTES: Record<string, Record<string, RouteRule>> = {
  'single-type': {
    'GET ': { row: 'S1', actions: ['read'] },
    'PUT ': { row: 'S2', actions: ['update'] },
    'POST publish': { row: 'S3', actions: ['publish'] },
    'POST unpublish': { row: 'S4', actions: ['unpublish'] },
  },
  'collection-type': {
    'GET ': { row: 'D1', actions: ['read'] },
    'POST ': { row: 'D2', actions: ['create'] },
    'GET :id': { row: 'D3', actions: ['read'] },
    'PUT :id': { row: 'D4', actions: ['update'] },
    'DELETE :id': { row: 'D5', actions: ['delete'] },
    'POST :id/publish': { row: 'D6', actions: ['publish'] },
    'POST :id/unpublish': { row: 'D7', actions: ['unpublish'] },
    'POST :id/duplicate': { row: 'D8', actions: ['create'] },
    'POST bulk': { row: 'D9', actions: ['create', 'publish'] },
    'DELETE bulk': { row: 'D10', actions: ['delete'] },
  },
};

/** Which contract row a documents request is, or `null` when the mock doesn't model it. */
function documentRoute(method: string, kind: string, rest: string[]): RouteRule | null {
  let shape = rest.join('/');
  if (kind === 'collection-type' && rest.length > 0 && rest[0] !== 'bulk') {
    shape = [':id', ...rest.slice(1)].join('/');
  }
  return DOCUMENT_ROUTES[kind]?.[`${method} ${shape}`] ?? null;
}

/**
 * An in-test content backend for C1 to C3, S1 to S4 and D1 to D10 (SPEC AC-5). It answers 401
 * without a valid bearer user, 403 when the user lacks the permission (C3 needs
 * `content_type:manager`; document routes accept the global or the slug-scoped grant), 404 for an
 * unknown slug or document, 400 for field data the schema doesn't allow and for publish or
 * unpublish on a Mode B type. Statuses move draft → published → modified (after an edit) → draft.
 * D9 is all-or-nothing; D10 reports per-id failures.
 */
export function createMockContent(): { content: MockContent; handle: ContentHandler } {
  const types = new Map<string, ContentType>();
  const documents = new Map<string, Stored[]>();
  const singles = new Map<string, Document | null>();
  const failingDeletes = new Map<string, string>();
  const saves: ContentSave[] = [];
  let created = 0;

  const store = (slug: string) => documents.get(slug) ?? [];
  const insert = (slug: string, doc: Document, publishedAt: string | null = null) => {
    const rows = store(slug);
    const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
    documents.set(slug, [...rows, { id, doc, publishedAt }]);
  };

  const content: MockContent = {
    addContentType(type) {
      types.set(type.slug, type);
    },
    addDocument(slug, doc) {
      insert(slug, doc, doc.status === 'draft' ? null : doc.updatedAt);
    },
    setSingle(slug, doc) {
      singles.set(slug, doc);
    },
    saves,
    failDelete(documentId, error = 'Delete failed') {
      failingDeletes.set(documentId, error);
    },
    documents(slug) {
      return store(slug).map((row) => row.doc);
    },
    single(slug) {
      return singles.get(slug);
    },
    contentType(slug) {
      return types.get(slug);
    },
  };

  async function handleContentTypes(
    route: Route,
    method: string,
    segments: string[],
    user: MeUser,
  ) {
    const [, slug, tail] = segments;
    if (method === 'PATCH' && segments.length === 3 && tail === 'list-fields') {
      if (!granted(user, 'content_type:manager')) return fail(route, 403, 'Forbidden resource');
      const type = types.get(slug!);
      if (!type) return fail(route, 404, TYPE_NOT_FOUND);
      const body: unknown = route.request().postDataJSON();
      const listFields = isObject(body) ? body.listFields : undefined;
      if (!Array.isArray(listFields) || listFields.length === 0) {
        return fail(route, 400, ['listFields must be a non-empty array']);
      }
      const eligible = (name: unknown) =>
        typeof name === 'string' &&
        (LISTABLE_SYSTEM.has(name) ||
          type.fields.some((f) => f.name === name && SCALAR_TYPES.has(f.type)));
      const bad = listFields.filter((name) => !eligible(name));
      if (bad.length > 0) {
        return fail(
          route,
          400,
          bad.map((name) => `listFields contains an ineligible column: ${String(name)}`),
        );
      }
      const next = { ...type, listFields: listFields as string[], updatedAt: now() };
      types.set(next.slug, next);
      return reply(route, 200, next);
    }
    if (method !== 'GET' || segments.length > 2) return null;
    if (!granted(user, 'content_type:read')) return fail(route, 403, 'Forbidden resource');
    if (segments.length === 1) return reply(route, 200, [...types.values()].map(summary));
    const type = types.get(slug!);
    return type ? reply(route, 200, type) : fail(route, 404, TYPE_NOT_FOUND);
  }

  async function handleSingle(route: Route, row: DocumentRoute, type: ContentType, user: MeUser) {
    const doc = singles.get(type.slug) ?? null;
    if (row === 'S1')
      return doc ? reply(route, 200, { data: doc }) : fail(route, 404, DOCUMENT_NOT_FOUND);
    if (row === 'S2') {
      const body: unknown = route.request().postDataJSON();
      saves.push({ route: 'S2', slug: type.slug, body });
      const { data, problems } = readSave(type, body);
      if (problems.length > 0) return fail(route, 400, problems);
      const stamp = now();
      const next: Document = {
        documentId: doc?.documentId ?? `${type.slug}-single`,
        status: !doc ? 'draft' : doc.status === 'published' ? 'modified' : doc.status,
        createdAt: doc?.createdAt ?? stamp,
        updatedAt: stamp,
        updatedBy: editor(user),
        ...data,
      };
      singles.set(type.slug, next);
      return reply(route, 200, { data: next });
    }
    if (!type.draftToPublish) return fail(route, 400, MODE_B);
    if (!doc) return fail(route, 404, DOCUMENT_NOT_FOUND);
    const status = row === 'S3' ? 'published' : 'draft';
    singles.set(type.slug, { ...doc, status });
    return reply(route, 200, { status });
  }

  async function handleCollection(
    route: Route,
    row: DocumentRoute,
    type: ContentType,
    user: MeUser,
    documentId: string | undefined,
    query: URLSearchParams,
  ) {
    const slug = type.slug;
    if (row === 'D1') {
      const problems = checkQuery(type, query);
      if (problems.length > 0) return fail(route, 400, problems);
      return reply(route, 200, listPage(type, store(slug), query));
    }
    if (row === 'D2') {
      const body: unknown = route.request().postDataJSON();
      saves.push({ route: 'D2', slug, body });
      const { data, problems } = readSave(type, body);
      if (problems.length > 0) return fail(route, 400, problems);
      const doc = newDocument(slug, data, user, 'draft');
      insert(slug, doc);
      return reply(route, 201, { data: doc });
    }
    if (row === 'D9') {
      const body: unknown = route.request().postDataJSON();
      const items = isObject(body) ? body.items : undefined;
      if (!Array.isArray(items) || items.length < 1 || items.length > MAX_BULK) {
        return fail(route, 400, ['items must contain 1 to 100 entries']);
      }
      const checked = items.map((item, i) => readSave(type, item, `items.${i}.`));
      const problems = checked.flatMap((c) => c.problems);
      // All or nothing: one invalid item rolls back the whole batch.
      if (problems.length > 0) return fail(route, 400, problems);
      const stamp = now();
      const docs = checked.map((c) => newDocument(slug, c.data, user, 'published'));
      for (const doc of docs) insert(slug, doc, stamp);
      return reply(route, 201, { items: docs.map((doc) => ({ data: doc })) });
    }
    if (row === 'D10') {
      const body: unknown = route.request().postDataJSON();
      const ids = isObject(body) ? body.documentIds : undefined;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_BULK) {
        return fail(route, 400, ['documentIds must contain 1 to 100 entries']);
      }
      const deleted: string[] = [];
      const failed: { documentId: string; error?: string }[] = [];
      for (const id of ids.map(String)) {
        const error = failingDeletes.get(id);
        if (error !== undefined) failed.push({ documentId: id, error });
        else if (!store(slug).some((r) => r.doc.documentId === id)) {
          failed.push({ documentId: id, error: DOCUMENT_NOT_FOUND });
        } else {
          documents.set(
            slug,
            store(slug).filter((r) => r.doc.documentId !== id),
          );
          deleted.push(id);
        }
      }
      return reply(route, 200, { deleted, failed });
    }

    if ((row === 'D6' || row === 'D7') && !type.draftToPublish) return fail(route, 400, MODE_B);
    const stored = store(slug).find((r) => r.doc.documentId === documentId);
    if (!stored) return fail(route, 404, DOCUMENT_NOT_FOUND);

    switch (row) {
      case 'D3':
        return reply(route, 200, { data: stored.doc });
      case 'D4': {
        const body: unknown = route.request().postDataJSON();
        saves.push({ route: 'D4', slug, documentId, body });
        const { data, problems } = readSave(type, body);
        if (problems.length > 0) return fail(route, 400, problems);
        const { status } = stored.doc;
        stored.doc = {
          ...stored.doc,
          ...data,
          status: status === 'published' ? 'modified' : status,
          updatedAt: now(),
          updatedBy: editor(user),
        };
        return reply(route, 200, { data: stored.doc });
      }
      case 'D5': {
        const error = failingDeletes.get(stored.doc.documentId);
        if (error !== undefined) return fail(route, 500, error);
        documents.set(
          slug,
          store(slug).filter((r) => r !== stored),
        );
        await route.fulfill({ status: 204 });
        return 204;
      }
      case 'D6':
        stored.doc = { ...stored.doc, status: 'published' };
        stored.publishedAt = now();
        return reply(route, 200, { status: 'published' });
      case 'D7':
        stored.doc = { ...stored.doc, status: 'draft' };
        stored.publishedAt = null;
        return reply(route, 200, { status: 'draft' });
      default: {
        // D8: a new draft copy of the source's schema fields.
        const copy = newDocument(slug, dynamicFields(stored.doc), user, 'draft');
        insert(slug, copy);
        return reply(route, 201, { data: copy });
      }
    }
  }

  function newDocument(
    slug: string,
    data: Record<string, unknown>,
    user: MeUser,
    status: Document['status'],
  ): Document {
    created += 1;
    const stamp = now();
    return {
      documentId: `${slug}-new-${created}`,
      status,
      createdAt: stamp,
      updatedAt: stamp,
      updatedBy: editor(user),
      ...data,
    };
  }

  const handle: ContentHandler = async (route, { method, path, query, user }) => {
    const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
    const isContentTypes = segments[0] === 'content-types';
    const isDocuments = segments[0] === 'documents';
    if (!isContentTypes && !isDocuments) return null;

    if (isContentTypes) {
      const known =
        (method === 'GET' && segments.length <= 2) ||
        (method === 'PATCH' && segments.length === 3 && segments[2] === 'list-fields');
      if (!known) return null;
      if (!user) return fail(route, 401, 'Unauthorized');
      return handleContentTypes(route, method, segments, user);
    }

    const [, kind = '', slug = '', ...rest] = segments;
    const target = slug ? documentRoute(method, kind, rest) : null;
    if (!target) return null;
    if (!user) return fail(route, 401, 'Unauthorized');
    if (!target.actions.every((action) => granted(user, `document:${action}:${slug}`))) {
      return fail(route, 403, 'Forbidden resource');
    }
    const type = types.get(slug);
    if (!type || type.kind !== (kind === 'single-type' ? 'single' : 'collection')) {
      return fail(route, 404, TYPE_NOT_FOUND);
    }
    if (kind === 'single-type') return handleSingle(route, target.row, type, user);
    const documentId = rest[0] === 'bulk' ? undefined : rest[0];
    return handleCollection(route, target.row, type, user, documentId, query);
  };

  return { content, handle };
}
