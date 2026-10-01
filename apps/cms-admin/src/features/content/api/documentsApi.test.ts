import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeDocument, makeListedItem, makeListResponse } from '@/test/contentFixtures';
import {
  bulkCreateDocumentsHandler,
  bulkDeleteDocumentsHandler,
  createDocumentHandler,
  deleteDocumentHandler,
  duplicateDocumentHandler,
  errorReply,
  getDocumentHandler,
  getSingleTypeHandler,
  listDocumentsHandler,
  publishDocumentHandler,
  publishSingleTypeHandler,
  saveSingleTypeHandler,
  unpublishDocumentHandler,
  unpublishSingleTypeHandler,
  updateDocumentHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';

import type { ListParams } from '../types';
import {
  bulkCreateDocuments,
  bulkDeleteDocuments,
  createDocument,
  deleteDocument,
  duplicateDocument,
  getDocument,
  getSingleTypeDocument,
  listDocuments,
  publishDocument,
  publishSingleType,
  saveSingleType,
  unpublishDocument,
  unpublishSingleType,
  updateDocument,
} from './documentsApi';

const SINGLE = '/api/v1/documents/single-type';
const COLLECTION = '/api/v1/documents/collection-type';

function abortedSignal(): AbortSignal {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
}

describe('single-type requests', () => {
  describe('getSingleTypeDocument (S1)', () => {
    it('GETs the single type and unwraps { data }', async () => {
      const doc = makeDocument({ title: 'Home page' });
      const s1 = getSingleTypeHandler(() => HttpResponse.json({ data: doc }));
      server.use(s1.handler);

      await expect(getSingleTypeDocument('home')).resolves.toEqual(doc);
      expect(s1.requests).toHaveLength(1);
      expect(s1.requests[0]?.method).toBe('GET');
      expect(s1.requests[0]?.url.pathname).toBe(`${SINGLE}/home`);
    });

    it('resolves null on a 404 (never saved)', async () => {
      const s1 = getSingleTypeHandler(errorReply(404, 'Not found'));
      server.use(s1.handler);

      await expect(getSingleTypeDocument('home')).resolves.toBeNull();
      expect(s1.requests).toHaveLength(1);
    });

    it.each([400, 403, 500])('rejects a %i with the server ApiError', async (status) => {
      server.use(getSingleTypeHandler(errorReply(status, 'Nope')).handler);

      const error = await getSingleTypeDocument('home').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status, message: 'Nope' });
    });

    it('encodes the slug (AC-6)', async () => {
      const s1 = getSingleTypeHandler();
      server.use(s1.handler);

      await getSingleTypeDocument('a/../b');

      expect(s1.requests[0]?.url.pathname).toBe(`${SINGLE}/a%2F..%2Fb`);
    });

    it('passes the abort signal', async () => {
      const s1 = getSingleTypeHandler();
      server.use(s1.handler);

      await expect(getSingleTypeDocument('home', abortedSignal())).rejects.toBeInstanceOf(ApiError);
      expect(s1.requests).toHaveLength(0);
    });
  });

  describe('saveSingleType (S2)', () => {
    it('PUTs { data } and unwraps the saved document', async () => {
      const s2 = saveSingleTypeHandler();
      server.use(s2.handler);

      const doc = await saveSingleType('home', { title: 'Saved' });

      expect(doc).toEqual(makeDocument({ title: 'Saved' }));
      expect(s2.requests).toHaveLength(1);
      expect(s2.requests[0]).toMatchObject({ method: 'PUT', body: { data: { title: 'Saved' } } });
      expect(s2.requests[0]?.url.pathname).toBe(`${SINGLE}/home`);
    });

    it('encodes the slug (AC-6)', async () => {
      const s2 = saveSingleTypeHandler();
      server.use(s2.handler);

      await saveSingleType('x?y', {});

      expect(s2.requests[0]?.url.pathname).toBe(`${SINGLE}/x%3Fy`);
      expect(s2.requests[0]?.url.search).toBe('');
    });

    it('rejects a 400 with the server ApiError', async () => {
      server.use(saveSingleTypeHandler(errorReply(400, 'title must be a string')).handler);

      await expect(saveSingleType('home', { title: 1 })).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('publishSingleType (S3) and unpublishSingleType (S4)', () => {
    it('POSTs /publish with no body and resolves with the status', async () => {
      const s3 = publishSingleTypeHandler();
      server.use(s3.handler);

      await expect(publishSingleType('home')).resolves.toEqual({ status: 'published' });
      expect(s3.requests[0]).toMatchObject({ method: 'POST', body: undefined });
      expect(s3.requests[0]?.url.pathname).toBe(`${SINGLE}/home/publish`);
    });

    it('POSTs /unpublish with no body and resolves with the status', async () => {
      const s4 = unpublishSingleTypeHandler();
      server.use(s4.handler);

      await expect(unpublishSingleType('home')).resolves.toEqual({ status: 'draft' });
      expect(s4.requests[0]).toMatchObject({ method: 'POST', body: undefined });
      expect(s4.requests[0]?.url.pathname).toBe(`${SINGLE}/home/unpublish`);
    });

    it('encode the slug (AC-6)', async () => {
      const s3 = publishSingleTypeHandler();
      const s4 = unpublishSingleTypeHandler();
      server.use(s3.handler, s4.handler);

      await publishSingleType('a/../b');
      await unpublishSingleType('x?y');

      expect(s3.requests[0]?.url.pathname).toBe(`${SINGLE}/a%2F..%2Fb/publish`);
      expect(s4.requests[0]?.url.pathname).toBe(`${SINGLE}/x%3Fy/unpublish`);
      expect(s4.requests[0]?.url.search).toBe('');
    });

    it('reject a Mode B 400 with the server ApiError', async () => {
      server.use(publishSingleTypeHandler(errorReply(400, 'draftToPublish is false')).handler);

      await expect(publishSingleType('home')).rejects.toMatchObject({ status: 400 });
    });
  });
});

describe('collection requests', () => {
  describe('listDocuments (D1)', () => {
    it('GETs the collection and resolves with the list response', async () => {
      const response = makeListResponse({
        items: [makeListedItem(), makeListedItem({ id: 2, documentId: 'doc-2' })],
        total: 42,
      });
      const d1 = listDocumentsHandler(() => HttpResponse.json(response));
      server.use(d1.handler);

      await expect(listDocuments('article', {})).resolves.toEqual(response);
      expect(d1.requests).toHaveLength(1);
      expect(d1.requests[0]?.method).toBe('GET');
      expect(d1.requests[0]?.url.pathname).toBe(`${COLLECTION}/article`);
      expect(d1.requests[0]?.url.search).toBe('');
    });

    it('sends the normalized params in the AC-3 order with wire names (AC-3, AC-4)', async () => {
      const d1 = listDocumentsHandler();
      server.use(d1.handler);
      const params: ListParams = {
        sortDir: 'asc',
        search: '  hello  ',
        filters: {
          title: { $contains: 'a b' },
          createdAt: { $gte: new Date('2026-01-02T03:04:05.000Z') },
          featured: { $eq: false },
          documentId: { $ne: 'doc-9' },
          empty: {},
        },
        orderBy: 'createdAt',
        size: 50,
        start: 0,
      };

      await listDocuments('article', params);

      const search = d1.requests[0]?.url.search ?? '';
      expect(decodeURIComponent(search.replaceAll('+', ' '))).toBe(
        '?size=50&orderBy=created_at&sortDir=asc&search=hello' +
          '&filters[created_at][$gte]=2026-01-02T03:04:05.000Z' +
          '&filters[document_id][$ne]=doc-9' +
          '&filters[featured][$eq]=false' +
          '&filters[title][$contains]=a b',
      );
    });

    it('sends nothing for params equal to the backend defaults', async () => {
      const d1 = listDocumentsHandler();
      server.use(d1.handler);

      await listDocuments('article', { start: 0, size: 20, orderBy: 'id', sortDir: 'desc' });

      expect(d1.requests[0]?.url.search).toBe('');
    });

    it('rejects invalid params with ERR_CLIENT_VALIDATION and sends no request (AC-5)', async () => {
      const d1 = listDocumentsHandler();
      server.use(d1.handler);
      const params = {
        start: -1,
        size: 101,
        filters: { title: { $eq: 'a', $ne: 'b' } },
      } satisfies ListParams;

      const error = await listDocuments('article', params).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 400, code: 'ERR_CLIENT_VALIDATION' });
      expect((error as ApiError).messages).toHaveLength(3);
      expect(d1.requests).toHaveLength(0);
    });

    it('encodes the slug so it cannot change the path or the query (AC-6)', async () => {
      const d1 = listDocumentsHandler();
      server.use(d1.handler);

      await listDocuments('x?start=5', { size: 10 });

      expect(d1.requests[0]?.url.pathname).toBe(`${COLLECTION}/x%3Fstart%3D5`);
      expect(d1.requests[0]?.url.search).toBe('?size=10');
    });

    it('rejects a server 400 with the server ApiError', async () => {
      server.use(listDocumentsHandler(errorReply(400, 'body cannot be sorted')).handler);

      await expect(listDocuments('article', { orderBy: 'body' })).rejects.toMatchObject({
        status: 400,
        message: 'body cannot be sorted',
      });
    });

    it('passes the abort signal', async () => {
      const d1 = listDocumentsHandler();
      server.use(d1.handler);

      await expect(listDocuments('article', {}, abortedSignal())).rejects.toBeInstanceOf(ApiError);
      expect(d1.requests).toHaveLength(0);
    });
  });

  describe('getDocument (D3)', () => {
    it('GETs the document and unwraps { data }', async () => {
      const d3 = getDocumentHandler();
      server.use(d3.handler);

      await expect(getDocument('article', 'doc-7')).resolves.toEqual(
        makeDocument({ documentId: 'doc-7' }),
      );
      expect(d3.requests[0]?.method).toBe('GET');
      expect(d3.requests[0]?.url.pathname).toBe(`${COLLECTION}/article/doc-7`);
    });

    it('encodes both the slug and the documentId (AC-6)', async () => {
      const d3 = getDocumentHandler();
      server.use(d3.handler);

      await getDocument('a/../b', 'x?y');

      expect(d3.requests[0]?.url.pathname).toBe(`${COLLECTION}/a%2F..%2Fb/x%3Fy`);
      expect(d3.requests[0]?.url.search).toBe('');
    });

    it('rejects a 404 with the server ApiError', async () => {
      server.use(getDocumentHandler(errorReply(404, 'Not found')).handler);

      await expect(getDocument('article', 'gone')).rejects.toMatchObject({ status: 404 });
    });

    it('passes the abort signal', async () => {
      const d3 = getDocumentHandler();
      server.use(d3.handler);

      await expect(getDocument('article', 'doc-1', abortedSignal())).rejects.toBeInstanceOf(
        ApiError,
      );
      expect(d3.requests).toHaveLength(0);
    });
  });

  describe('createDocument (D2)', () => {
    it('POSTs { data } and unwraps the created document', async () => {
      const d2 = createDocumentHandler();
      server.use(d2.handler);

      const doc = await createDocument('article', { title: 'New' });

      expect(doc).toEqual(makeDocument({ documentId: 'doc-new', title: 'New' }));
      expect(d2.requests[0]).toMatchObject({ method: 'POST', body: { data: { title: 'New' } } });
      expect(d2.requests[0]?.url.pathname).toBe(`${COLLECTION}/article`);
    });

    it('encodes the slug (AC-6)', async () => {
      const d2 = createDocumentHandler();
      server.use(d2.handler);

      await createDocument('x?y', {});

      expect(d2.requests[0]?.url.pathname).toBe(`${COLLECTION}/x%3Fy`);
    });

    it('rejects a 400 with the server ApiError', async () => {
      server.use(createDocumentHandler(errorReply(400, 'title is required')).handler);

      await expect(createDocument('article', {})).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('updateDocument (D4)', () => {
    it('PUTs { data } and unwraps the updated document', async () => {
      const d4 = updateDocumentHandler();
      server.use(d4.handler);

      const doc = await updateDocument('article', 'doc-3', { title: 'Edited' });

      expect(doc).toEqual(
        makeDocument({ documentId: 'doc-3', status: 'modified', title: 'Edited' }),
      );
      expect(d4.requests[0]).toMatchObject({ method: 'PUT', body: { data: { title: 'Edited' } } });
      expect(d4.requests[0]?.url.pathname).toBe(`${COLLECTION}/article/doc-3`);
    });

    it('encodes both segments (AC-6)', async () => {
      const d4 = updateDocumentHandler();
      server.use(d4.handler);

      await updateDocument('x?y', 'a/../b', {});

      expect(d4.requests[0]?.url.pathname).toBe(`${COLLECTION}/x%3Fy/a%2F..%2Fb`);
    });
  });

  describe('deleteDocument (D5)', () => {
    it('DELETEs the document and resolves with nothing on 204', async () => {
      const d5 = deleteDocumentHandler();
      server.use(d5.handler);

      await expect(deleteDocument('article', 'doc-4')).resolves.toBeUndefined();
      expect(d5.requests[0]).toMatchObject({ method: 'DELETE', body: undefined });
      expect(d5.requests[0]?.url.pathname).toBe(`${COLLECTION}/article/doc-4`);
    });

    it('encodes both segments (AC-6)', async () => {
      const d5 = deleteDocumentHandler();
      server.use(d5.handler);

      await deleteDocument('a/../b', 'x?y');

      expect(d5.requests[0]?.url.pathname).toBe(`${COLLECTION}/a%2F..%2Fb/x%3Fy`);
    });

    it('rejects a 404 with the server ApiError', async () => {
      server.use(deleteDocumentHandler(errorReply(404, 'Not found')).handler);

      await expect(deleteDocument('article', 'gone')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('duplicateDocument (D8)', () => {
    it('POSTs /duplicate with no body and unwraps the new draft', async () => {
      const d8 = duplicateDocumentHandler();
      server.use(d8.handler);

      const copy = await duplicateDocument('article', 'doc-5');

      expect(copy).toEqual(makeDocument({ documentId: 'doc-5-copy', status: 'draft' }));
      expect(d8.requests[0]).toMatchObject({ method: 'POST', body: undefined });
      expect(d8.requests[0]?.url.pathname).toBe(`${COLLECTION}/article/doc-5/duplicate`);
    });

    it('encodes both segments (AC-6)', async () => {
      const d8 = duplicateDocumentHandler();
      server.use(d8.handler);

      await duplicateDocument('x?y', 'a/../b');

      expect(d8.requests[0]?.url.pathname).toBe(`${COLLECTION}/x%3Fy/a%2F..%2Fb/duplicate`);
    });
  });

  describe('publishDocument (D6) and unpublishDocument (D7)', () => {
    it('POST with no body and resolve with the status', async () => {
      const d6 = publishDocumentHandler();
      const d7 = unpublishDocumentHandler();
      server.use(d6.handler, d7.handler);

      await expect(publishDocument('article', 'doc-6')).resolves.toEqual({ status: 'published' });
      await expect(unpublishDocument('article', 'doc-6')).resolves.toEqual({ status: 'draft' });

      expect(d6.requests[0]).toMatchObject({ method: 'POST', body: undefined });
      expect(d6.requests[0]?.url.pathname).toBe(`${COLLECTION}/article/doc-6/publish`);
      expect(d7.requests[0]).toMatchObject({ method: 'POST', body: undefined });
      expect(d7.requests[0]?.url.pathname).toBe(`${COLLECTION}/article/doc-6/unpublish`);
    });

    it('encode both segments (AC-6)', async () => {
      const d6 = publishDocumentHandler();
      const d7 = unpublishDocumentHandler();
      server.use(d6.handler, d7.handler);

      await publishDocument('a/../b', 'x?y');
      await unpublishDocument('x?y', 'a/../b');

      expect(d6.requests[0]?.url.pathname).toBe(`${COLLECTION}/a%2F..%2Fb/x%3Fy/publish`);
      expect(d7.requests[0]?.url.pathname).toBe(`${COLLECTION}/x%3Fy/a%2F..%2Fb/unpublish`);
    });

    it('reject a Mode B 400 with the server ApiError', async () => {
      server.use(unpublishDocumentHandler(errorReply(400, 'draftToPublish is false')).handler);

      await expect(unpublishDocument('article', 'doc-6')).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('bulkCreateDocuments (D9)', () => {
    it('POSTs { items: { data }[] } to /bulk and unwraps each created document', async () => {
      const d9 = bulkCreateDocumentsHandler();
      server.use(d9.handler);

      const docs = await bulkCreateDocuments('article', [{ title: 'A' }, { title: 'B' }]);

      expect(docs).toEqual([
        makeDocument({ documentId: 'doc-bulk-1', status: 'published', title: 'A' }),
        makeDocument({ documentId: 'doc-bulk-2', status: 'published', title: 'B' }),
      ]);
      expect(d9.requests).toHaveLength(1);
      expect(d9.requests[0]).toMatchObject({
        method: 'POST',
        body: { items: [{ data: { title: 'A' } }, { data: { title: 'B' } }] },
      });
      expect(d9.requests[0]?.url.pathname).toBe(`${COLLECTION}/article/bulk`);
    });

    it('encodes the slug (AC-6)', async () => {
      const d9 = bulkCreateDocumentsHandler();
      server.use(d9.handler);

      await bulkCreateDocuments('x?y', [{}]);

      expect(d9.requests[0]?.url.pathname).toBe(`${COLLECTION}/x%3Fy/bulk`);
    });

    it('rejects an all-or-nothing 400 with the server ApiError', async () => {
      server.use(bulkCreateDocumentsHandler(errorReply(400, 'items.1.title is required')).handler);

      await expect(bulkCreateDocuments('article', [{}, {}])).rejects.toMatchObject({
        status: 400,
        message: 'items.1.title is required',
      });
    });
  });

  describe('bulkDeleteDocuments (D10)', () => {
    it('sends { documentIds } as the DELETE body and resolves with { deleted, failed } unchanged', async () => {
      const result = { deleted: ['doc-1'], failed: [{ documentId: 'doc-2', error: 'Not found' }] };
      const d10 = bulkDeleteDocumentsHandler(() => HttpResponse.json(result));
      const d5 = deleteDocumentHandler();
      server.use(d10.handler, d5.handler);

      await expect(bulkDeleteDocuments('article', ['doc-1', 'doc-2'])).resolves.toEqual(result);
      expect(d5.requests).toHaveLength(0);
      expect(d10.requests).toHaveLength(1);
      expect(d10.requests[0]).toMatchObject({
        method: 'DELETE',
        body: { documentIds: ['doc-1', 'doc-2'] },
      });
      expect(d10.requests[0]?.url.pathname).toBe(`${COLLECTION}/article/bulk`);
    });

    it('encodes the slug (AC-6)', async () => {
      const d10 = bulkDeleteDocumentsHandler();
      server.use(d10.handler);

      await bulkDeleteDocuments('a/../b', ['doc-1']);

      expect(d10.requests[0]?.url.pathname).toBe(`${COLLECTION}/a%2F..%2Fb/bulk`);
    });
  });
});
