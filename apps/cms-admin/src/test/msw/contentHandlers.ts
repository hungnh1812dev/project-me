import { http, HttpResponse, type RequestHandler } from 'msw';

import type {
  BulkCreateResponse,
  BulkDeleteResult,
  Document,
  PublishResult,
} from '@/features/content/types';
import {
  makeContentType,
  makeContentTypeSummary,
  makeDocument,
  makeListResponse,
} from '@/test/contentFixtures';

// Opt-in handlers for the content endpoints (SPEC C1–C3, S1–S4, D1–D10). They are NOT part of the
// global defaults: a test installs the ones it needs with `server.use(recorder.handler)`, so a stray
// call still fails under `onUnhandledRequest: 'error'`. Each recorder counts the requests it served.

/** One request a content handler served. */
export interface RecordedRequest {
  method: string;
  url: URL;
  /** Path params as MSW decoded them, e.g. `{ slug, documentId }`. */
  params: Record<string, string>;
  /** The parsed JSON body, or undefined when the request had none. */
  body: unknown;
}

/** Builds the response for a recorded request. */
export type Reply = (request: RecordedRequest) => Response | Promise<Response>;

/** An installable MSW handler plus the requests it has served, in order. */
export interface ContentHandler {
  handler: RequestHandler;
  requests: RecordedRequest[];
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

const BASE = '*/api/v1';
const COLLECTION = `${BASE}/documents/collection-type/:slug`;
const SINGLE = `${BASE}/documents/single-type/:slug`;

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? (JSON.parse(text) as unknown) : undefined;
}

function toParams(params: Record<string, string | readonly string[] | undefined>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function recorder(method: Method, path: string, fallback: Reply, skipBulk = false) {
  return (reply: Reply = fallback): ContentHandler => {
    const requests: RecordedRequest[] = [];
    const handler = http[method](path, async ({ request, params }) => {
      // `/bulk` is its own route; let the bulk handler (if installed) answer it.
      if (skipBulk && params.documentId === 'bulk') return undefined;
      const recorded: RecordedRequest = {
        method: request.method,
        url: new URL(request.url),
        params: toParams(params),
        body: await readJson(request),
      };
      requests.push(recorded);
      return reply(recorded);
    });
    return { handler, requests };
  };
}

function bodyData(body: unknown): Record<string, unknown> {
  if (typeof body === 'object' && body !== null && 'data' in body) {
    const { data } = body;
    if (typeof data === 'object' && data !== null) return data as Record<string, unknown>;
  }
  return {};
}

function bodyArray(body: unknown, key: string): unknown[] {
  if (typeof body === 'object' && body !== null && key in body) {
    const value = (body as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

const published: PublishResult = { status: 'published' };
const draft: PublishResult = { status: 'draft' };

/** A Nest-style error response, for custom replies. */
export function errorReply(status: number, message = 'Error'): Reply {
  return () => HttpResponse.json({ statusCode: status, message }, { status });
}

/** C1 `GET /content-types`. Default: one collection and one single type. */
export const getContentTypesHandler = recorder('get', `${BASE}/content-types`, () =>
  HttpResponse.json([
    makeContentTypeSummary(),
    makeContentTypeSummary({ slug: 'home', name: 'Home', kind: 'single' }),
  ]),
);

/** C2 `GET /content-types/:slug`. Default: `makeContentType` with the requested slug. */
export const getContentTypeHandler = recorder('get', `${BASE}/content-types/:slug`, ({ params }) =>
  HttpResponse.json(makeContentType({ slug: params.slug })),
);

/** C3 `PATCH /content-types/:slug/list-fields`. Default: echoes the new `listFields`. */
export const patchListFieldsHandler = recorder(
  'patch',
  `${BASE}/content-types/:slug/list-fields`,
  ({ params, body }) =>
    HttpResponse.json(
      makeContentType({ slug: params.slug, listFields: bodyArray(body, 'listFields') as string[] }),
    ),
);

/** S1 `GET /documents/single-type/:slug`. Default: a saved document. */
export const getSingleTypeHandler = recorder('get', SINGLE, () =>
  HttpResponse.json({ data: makeDocument() }),
);

/** S2 `PUT /documents/single-type/:slug`. Default: echoes `data` into a saved document. */
export const saveSingleTypeHandler = recorder('put', SINGLE, ({ body }) =>
  HttpResponse.json({ data: makeDocument(bodyData(body)) }),
);

/** S3 `POST /documents/single-type/:slug/publish`. */
export const publishSingleTypeHandler = recorder('post', `${SINGLE}/publish`, () =>
  HttpResponse.json(published),
);

/** S4 `POST /documents/single-type/:slug/unpublish`. */
export const unpublishSingleTypeHandler = recorder('post', `${SINGLE}/unpublish`, () =>
  HttpResponse.json(draft),
);

/** D1 `GET /documents/collection-type/:slug`. Default: one listed item. */
export const listDocumentsHandler = recorder('get', COLLECTION, () =>
  HttpResponse.json(makeListResponse()),
);

/** D2 `POST /documents/collection-type/:slug`. Default: 201 with `data` echoed into a new draft. */
export const createDocumentHandler = recorder('post', COLLECTION, ({ body }) =>
  HttpResponse.json(
    { data: makeDocument({ documentId: 'doc-new', ...bodyData(body) }) },
    { status: 201 },
  ),
);

/** D3 `GET …/:slug/:documentId`. Default: the document with the requested id. */
export const getDocumentHandler = recorder(
  'get',
  `${COLLECTION}/:documentId`,
  ({ params }) => HttpResponse.json({ data: makeDocument({ documentId: params.documentId }) }),
  true,
);

/** D4 `PUT …/:slug/:documentId`. Default: echoes `data` into the document. */
export const updateDocumentHandler = recorder(
  'put',
  `${COLLECTION}/:documentId`,
  ({ params, body }) =>
    HttpResponse.json({
      data: makeDocument({ documentId: params.documentId, status: 'modified', ...bodyData(body) }),
    }),
  true,
);

/** D5 `DELETE …/:slug/:documentId`. Default: 204. Falls through for `/bulk`. */
export const deleteDocumentHandler = recorder(
  'delete',
  `${COLLECTION}/:documentId`,
  () => new HttpResponse(null, { status: 204 }),
  true,
);

/** D6 `POST …/:slug/:documentId/publish`. */
export const publishDocumentHandler = recorder('post', `${COLLECTION}/:documentId/publish`, () =>
  HttpResponse.json(published),
);

/** D7 `POST …/:slug/:documentId/unpublish`. */
export const unpublishDocumentHandler = recorder(
  'post',
  `${COLLECTION}/:documentId/unpublish`,
  () => HttpResponse.json(draft),
);

/** D8 `POST …/:slug/:documentId/duplicate`. Default: 201 with a new draft copy. */
export const duplicateDocumentHandler = recorder(
  'post',
  `${COLLECTION}/:documentId/duplicate`,
  ({ params }) =>
    HttpResponse.json(
      { data: makeDocument({ documentId: `${params.documentId}-copy`, status: 'draft' }) },
      { status: 201 },
    ),
);

/** D9 `POST /documents/collection-type/:slug/bulk`. Default: 201, every item created and published. */
export const bulkCreateDocumentsHandler = recorder('post', `${COLLECTION}/bulk`, ({ body }) => {
  const items = bodyArray(body, 'items').map((item, i): { data: Document } => ({
    data: makeDocument({ documentId: `doc-bulk-${i + 1}`, status: 'published', ...bodyData(item) }),
  }));
  const response: BulkCreateResponse = { items };
  return HttpResponse.json(response, { status: 201 });
});

/** D10 `DELETE /documents/collection-type/:slug/bulk`. Default: every id deleted, none failed. */
export const bulkDeleteDocumentsHandler = recorder('delete', `${COLLECTION}/bulk`, ({ body }) => {
  const result: BulkDeleteResult = {
    deleted: bodyArray(body, 'documentIds').filter((id): id is string => typeof id === 'string'),
    failed: [],
  };
  return HttpResponse.json(result);
});
