import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeContentType, makeContentTypeSummary } from '@/test/contentFixtures';
import {
  errorReply,
  getContentTypeHandler,
  getContentTypesHandler,
  patchListFieldsHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';

import { getContentType, getContentTypes, updateListFields } from './contentTypesApi';

describe('getContentTypes (C1)', () => {
  it('GETs /content-types and resolves with the summaries', async () => {
    const types = [
      makeContentTypeSummary(),
      makeContentTypeSummary({ slug: 'home', kind: 'single' }),
    ];
    const c1 = getContentTypesHandler(() => HttpResponse.json(types));
    server.use(c1.handler);

    await expect(getContentTypes()).resolves.toEqual(types);
    expect(c1.requests).toHaveLength(1);
    expect(c1.requests[0]).toMatchObject({ method: 'GET', body: undefined });
    expect(c1.requests[0]?.url.pathname).toBe('/api/v1/content-types');
  });

  it('rejects with the server ApiError', async () => {
    server.use(getContentTypesHandler(errorReply(403, 'Forbidden resource')).handler);

    const error = await getContentTypes().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, message: 'Forbidden resource' });
  });

  it('passes the abort signal to the request', async () => {
    const c1 = getContentTypesHandler();
    server.use(c1.handler);
    const controller = new AbortController();
    controller.abort();

    await expect(getContentTypes(controller.signal)).rejects.toBeInstanceOf(ApiError);
    expect(c1.requests).toHaveLength(0);
  });
});

describe('getContentType (C2)', () => {
  it('GETs /content-types/:slug and resolves with the content type', async () => {
    const c2 = getContentTypeHandler();
    server.use(c2.handler);

    await expect(getContentType('article')).resolves.toEqual(makeContentType({ slug: 'article' }));
    expect(c2.requests[0]?.url.pathname).toBe('/api/v1/content-types/article');
  });

  it.each([
    ['a/../b', '/api/v1/content-types/a%2F..%2Fb'],
    ['x?y', '/api/v1/content-types/x%3Fy'],
    ['a#b', '/api/v1/content-types/a%23b'],
  ])('encodes the slug %s as one path segment (AC-6)', async (slug, pathname) => {
    const c2 = getContentTypeHandler();
    server.use(c2.handler);

    await getContentType(slug);

    expect(c2.requests).toHaveLength(1);
    expect(c2.requests[0]?.url.pathname).toBe(pathname);
    expect(c2.requests[0]?.url.search).toBe('');
  });

  it('rejects a 404 with the server ApiError', async () => {
    server.use(getContentTypeHandler(errorReply(404, 'Not found')).handler);

    await expect(getContentType('missing')).rejects.toMatchObject({ status: 404 });
  });

  it('passes the abort signal to the request', async () => {
    const c2 = getContentTypeHandler();
    server.use(c2.handler);
    const controller = new AbortController();
    controller.abort();

    await expect(getContentType('article', controller.signal)).rejects.toBeInstanceOf(ApiError);
    expect(c2.requests).toHaveLength(0);
  });
});

describe('updateListFields (C3)', () => {
  it('PATCHes { listFields } and resolves with the updated content type', async () => {
    const c3 = patchListFieldsHandler();
    server.use(c3.handler);

    const result = await updateListFields('article', ['id', 'title']);

    expect(result).toEqual(makeContentType({ slug: 'article', listFields: ['id', 'title'] }));
    expect(c3.requests).toHaveLength(1);
    expect(c3.requests[0]).toMatchObject({
      method: 'PATCH',
      body: { listFields: ['id', 'title'] },
    });
    expect(c3.requests[0]?.url.pathname).toBe('/api/v1/content-types/article/list-fields');
  });

  it('encodes the slug (AC-6)', async () => {
    const c3 = patchListFieldsHandler();
    server.use(c3.handler);

    await updateListFields('x?y', ['title']);

    expect(c3.requests[0]?.url.pathname).toBe('/api/v1/content-types/x%3Fy/list-fields');
    expect(c3.requests[0]?.url.search).toBe('');
  });

  it('rejects a server 400 with the server ApiError', async () => {
    server.use(patchListFieldsHandler(errorReply(400, 'body is not listable')).handler);

    await expect(updateListFields('article', ['body'])).rejects.toMatchObject({
      status: 400,
      message: 'body is not listable',
    });
  });
});
