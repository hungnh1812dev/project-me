import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  makeContentType,
  makeDocument,
  makeFieldSet,
  makeListedItem,
} from '@/test/contentFixtures';

import {
  bulkCreateDocumentsHandler,
  bulkDeleteDocumentsHandler,
  createDocumentHandler,
  deleteDocumentHandler,
  duplicateDocumentHandler,
  getContentTypeHandler,
  getContentTypesHandler,
  getDocumentHandler,
  getSingleTypeHandler,
  listDocumentsHandler,
  patchListFieldsHandler,
  publishDocumentHandler,
  publishSingleTypeHandler,
  saveSingleTypeHandler,
  unpublishDocumentHandler,
  unpublishSingleTypeHandler,
  updateDocumentHandler,
  type ContentHandler,
  type Reply,
} from './contentHandlers';
import { handlers } from './handlers';
import { server } from './server';

const API = 'http://localhost/api/v1';

describe('content MSW handlers', () => {
  it('are not part of the global default handlers', () => {
    const recorder = getContentTypesHandler();
    const defaultPaths = handlers.map((h) => String((h.info as { path?: unknown }).path));

    expect(handlers).not.toContain(recorder.handler);
    expect(defaultPaths.some((p) => /content-types|documents/.test(p))).toBe(false);
  });

  it('record each request with its method, path params, query and JSON body', async () => {
    const recorder = patchListFieldsHandler();
    server.use(recorder.handler);

    const res = await fetch(`${API}/content-types/article/list-fields`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listFields: ['title'] }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ slug: 'article', listFields: ['title'] });
    expect(recorder.requests).toHaveLength(1);
    expect(recorder.requests[0]).toMatchObject({
      method: 'PATCH',
      params: { slug: 'article' },
      body: { listFields: ['title'] },
    });
  });

  it('expose the raw query string of a list request', async () => {
    const recorder = listDocumentsHandler();
    server.use(recorder.handler);

    await fetch(
      `${API}/documents/collection-type/article?start=20&filters%5Btitle%5D%5B%24eq%5D=a`,
    );

    expect(recorder.requests[0]?.url.searchParams.get('filters[title][$eq]')).toBe('a');
    expect(recorder.requests[0]?.url.searchParams.get('start')).toBe('20');
  });

  it('use a custom reply when one is given', async () => {
    const recorder = getSingleTypeHandler(() =>
      HttpResponse.json({ data: makeDocument({ title: 'Custom' }) }),
    );
    server.use(recorder.handler);

    const res = await fetch(`${API}/documents/single-type/home`);

    expect(await res.json()).toMatchObject({ data: { title: 'Custom' } });
  });

  it('let a single-document delete fall through to the bulk delete handler for `/bulk`', async () => {
    const single = deleteDocumentHandler();
    const bulk = bulkDeleteDocumentsHandler();
    server.use(bulk.handler, single.handler);

    const res = await fetch(`${API}/documents/collection-type/article/bulk`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentIds: ['a', 'b'] }),
    });

    expect(await res.json()).toEqual({ deleted: ['a', 'b'], failed: [] });
    expect(single.requests).toHaveLength(0);
    expect(bulk.requests).toHaveLength(1);
  });
});

type Recorder = (reply?: Reply) => ContentHandler;

describe('one opt-in recorder per contract row (AC-5)', () => {
  const COL = '/documents/collection-type/my%20type';
  it.each<[string, Recorder, string, string, unknown, number, unknown]>([
    [
      'C1',
      getContentTypesHandler,
      'GET',
      '/content-types',
      undefined,
      200,
      [{ slug: 'article' }, { slug: 'home' }],
    ],
    [
      'C2',
      getContentTypeHandler,
      'GET',
      '/content-types/my%20type',
      undefined,
      200,
      { slug: 'my type' },
    ],
    [
      'C3',
      patchListFieldsHandler,
      'PATCH',
      '/content-types/my%20type/list-fields',
      { listFields: ['id'] },
      200,
      { listFields: ['id'] },
    ],
    [
      'S1',
      getSingleTypeHandler,
      'GET',
      '/documents/single-type/my%20type',
      undefined,
      200,
      { data: { documentId: 'doc-1' } },
    ],
    [
      'S2',
      saveSingleTypeHandler,
      'PUT',
      '/documents/single-type/my%20type',
      { data: { title: 'T' } },
      200,
      { data: { title: 'T' } },
    ],
    [
      'S3',
      publishSingleTypeHandler,
      'POST',
      '/documents/single-type/my%20type/publish',
      undefined,
      200,
      { status: 'published' },
    ],
    [
      'S4',
      unpublishSingleTypeHandler,
      'POST',
      '/documents/single-type/my%20type/unpublish',
      undefined,
      200,
      { status: 'draft' },
    ],
    ['D1', listDocumentsHandler, 'GET', `${COL}?size=10`, undefined, 200, { total: 1 }],
    [
      'D2',
      createDocumentHandler,
      'POST',
      COL,
      { data: { title: 'New' } },
      201,
      { data: { documentId: 'doc-new', title: 'New' } },
    ],
    [
      'D3',
      getDocumentHandler,
      'GET',
      `${COL}/doc%2F7`,
      undefined,
      200,
      { data: { documentId: 'doc/7' } },
    ],
    [
      'D4',
      updateDocumentHandler,
      'PUT',
      `${COL}/doc-7`,
      { data: { title: 'E' } },
      200,
      { data: { status: 'modified', title: 'E' } },
    ],
    ['D5', deleteDocumentHandler, 'DELETE', `${COL}/doc-7`, undefined, 204, null],
    [
      'D6',
      publishDocumentHandler,
      'POST',
      `${COL}/doc-7/publish`,
      undefined,
      200,
      { status: 'published' },
    ],
    [
      'D7',
      unpublishDocumentHandler,
      'POST',
      `${COL}/doc-7/unpublish`,
      undefined,
      200,
      { status: 'draft' },
    ],
    [
      'D8',
      duplicateDocumentHandler,
      'POST',
      `${COL}/doc-7/duplicate`,
      undefined,
      201,
      { data: { documentId: 'doc-7-copy' } },
    ],
    [
      'D9',
      bulkCreateDocumentsHandler,
      'POST',
      `${COL}/bulk`,
      { items: [{ data: { title: 'A' } }] },
      201,
      { items: [{ data: { status: 'published', title: 'A' } }] },
    ],
    [
      'D10',
      bulkDeleteDocumentsHandler,
      'DELETE',
      `${COL}/bulk`,
      { documentIds: ['a'] },
      200,
      { deleted: ['a'], failed: [] },
    ],
  ])(
    '%s records method, decoded path, query and body',
    async (_row, make, method, path, body, status, reply) => {
      const recorder = make();
      server.use(recorder.handler);

      const res = await fetch(`${API}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });

      expect(res.status).toBe(status);
      if (reply === null) expect(await res.text()).toBe('');
      else expect(await res.json()).toMatchObject(reply as object);
      expect(recorder.requests).toHaveLength(1);
      const [recorded] = recorder.requests;
      expect(recorded?.method).toBe(method);
      expect(recorded?.path).toBe(decodeURIComponent(`/api/v1${path.split('?')[0]}`));
      expect(recorded?.url.search).toBe(path.includes('?') ? `?${path.split('?')[1]}` : '');
      expect(recorded?.body).toEqual(body);
    },
  );
});

describe('content fixtures (AC-5)', () => {
  it('makeFieldSet covers every field kind, nested and repeatable', () => {
    const fields = makeFieldSet();
    const types = new Set(fields.map((f) => f.type));

    expect([...types]).toEqual(
      expect.arrayContaining([
        'text',
        'richtext',
        'number',
        'boolean',
        'media',
        'json',
        'component',
      ]),
    );
    expect(types.has('geo' as never)).toBe(true);
    const seo = fields.find((f) => f.name === 'seo');
    const gallery = fields.find((f) => f.name === 'gallery');
    expect(seo?.fields?.some((f) => f.type === 'component')).toBe(true);
    expect(gallery?.repeatable).toBe(true);
    expect(gallery?.fields?.some((f) => f.type === 'component' && f.repeatable)).toBe(true);
  });

  it('build a content type, a document and a listed item with overrides', () => {
    expect(makeContentType({ slug: 'x', fields: makeFieldSet() })).toMatchObject({ slug: 'x' });
    expect(makeDocument({ status: 'published' })).toMatchObject({ status: 'published' });
    expect(makeListedItem({ id: 9 })).toMatchObject({ id: 9, data: { title: 'Hello world' } });
  });
});
