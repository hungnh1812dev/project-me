import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeDocument } from '@/test/contentFixtures';

import {
  bulkDeleteDocumentsHandler,
  deleteDocumentHandler,
  getContentTypesHandler,
  getSingleTypeHandler,
  listDocumentsHandler,
  patchListFieldsHandler,
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
