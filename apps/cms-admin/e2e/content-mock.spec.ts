import type { Page } from '@playwright/test';

import type { Role } from '../src/features/auth/types.ts';
import {
  BLOG,
  blogPost,
  CHANGELOG,
  CONTENT_MANAGER,
  seedContent,
} from './fixtures/contentFixtures.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

/** The in-memory content backend (AC-5): C3, S2 to S4 and D2 to D10, with the backend's rules. */

const JANE = 'jane@example.com';

interface Reply {
  status: number;
  body: unknown;
}

/** Signs Jane in with `role`, loads the app and returns a caller that uses her bearer token. */
async function signIn(page: Page, mockApi: MockApi, role: Role = ROLES.superAdmin) {
  mockApi.addUser({ email: JANE, name: 'Jane Doe', role });
  mockApi.signInAs(JANE);
  await page.goto('/admin');
  await expect.poll(() => mockApi.latestAccessToken(JANE)).toBeDefined();
  const token = mockApi.latestAccessToken(JANE)!;

  return (method: string, path: string, body?: unknown): Promise<Reply> =>
    page.evaluate(
      async ({ method, path, body, token }) => {
        const res = await fetch(`/api/v1${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
      },
      { method, path, body, token },
    );
}

const role = (permissions: string[]): Role => ({
  ...ROLES.contentEditor,
  documentId: 'role-custom',
  slug: 'custom',
  permissions,
});

test('C3 saves listable columns for a content_type:manager only', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  const api = await signIn(page, mockApi, CONTENT_MANAGER);

  const saved = await api('PATCH', '/content-types/blog/list-fields', {
    listFields: ['status', 'title', 'views'],
  });
  expect(saved).toMatchObject({
    status: 200,
    body: { slug: 'blog', listFields: ['status', 'title', 'views'] },
  });
  expect((await api('GET', '/content-types/blog')).body).toMatchObject({
    listFields: ['status', 'title', 'views'],
  });

  expect(await api('PATCH', '/content-types/blog/list-fields', { listFields: [] })).toMatchObject({
    status: 400,
  });
  expect(
    await api('PATCH', '/content-types/blog/list-fields', { listFields: ['title', 'body'] }),
  ).toMatchObject({
    status: 400,
    body: { message: ['listFields contains an ineligible column: body'] },
  });
  expect(
    (await api('PATCH', '/content-types/nope/list-fields', { listFields: ['id'] })).status,
  ).toBe(404);
});

test('C3 answers 403 without content_type:manager', async ({ page, mockApi, mockContent }) => {
  seedContent(mockContent);
  const api = await signIn(page, mockApi, ROLES.superAdmin);

  expect(
    (await api('PATCH', '/content-types/blog/list-fields', { listFields: ['id'] })).status,
  ).toBe(403);
});

test('S2 to S4 move a single type from never saved to draft, published, modified and back', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  const api = await signIn(page, mockApi);

  expect((await api('GET', '/documents/single-type/homepage')).status).toBe(404);
  expect((await api('POST', '/documents/single-type/homepage/publish')).status).toBe(404);

  const created = await api('PUT', '/documents/single-type/homepage', {
    data: { headline: 'Hi', intro: '<p>x</p>', visitors: 3 },
  });
  expect(created).toMatchObject({
    status: 200,
    body: { data: { status: 'draft', headline: 'Hi', updatedBy: { name: 'Jane Doe' } } },
  });
  expect(await api('POST', '/documents/single-type/homepage/publish')).toEqual({
    status: 200,
    body: { status: 'published' },
  });
  expect(
    (await api('PUT', '/documents/single-type/homepage', { data: { headline: 'Hey' } })).body,
  ).toMatchObject({ data: { status: 'modified', headline: 'Hey' } });
  expect(await api('POST', '/documents/single-type/homepage/unpublish')).toEqual({
    status: 200,
    body: { status: 'draft' },
  });
  expect((await api('GET', '/documents/single-type/homepage')).body).toMatchObject({
    data: { status: 'draft', headline: 'Hey' },
  });
  expect(mockContent.saves.map((save) => [save.route, save.slug, save.body])).toEqual([
    ['S2', 'homepage', { data: { headline: 'Hi', intro: '<p>x</p>', visitors: 3 } }],
    ['S2', 'homepage', { data: { headline: 'Hey' } }],
  ]);
});

test('saves reject field data the schema does not allow, with every message', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  const api = await signIn(page, mockApi);

  const res = await api('PUT', '/documents/single-type/homepage', {
    data: { headline: 5, visitors: 'many', status: 'published' },
  });

  expect(res).toMatchObject({
    status: 400,
    body: {
      message: [
        'headline must be a string',
        'visitors must be a number',
        'status is not a field of homepage',
      ],
    },
  });
  expect((await api('GET', '/documents/single-type/homepage')).status).toBe(404);
});

test('nested component values are checked too', async ({ page, mockApi, mockContent }) => {
  seedContent(mockContent);
  const api = await signIn(page, mockApi);

  const ok = await api('POST', '/documents/collection-type/showcase', {
    data: {
      title: 'All kinds',
      views: null,
      featured: true,
      meta: { any: ['json'] },
      coverImage: 'media-1',
      seo: { metaTitle: 'Meta', social: { handle: '@me' } },
      gallery: [{ caption: 'One', tags: [{ label: 'a' }] }],
      location: { lat: 1 },
    },
  });
  expect(ok.status).toBe(201);

  const bad = await api('POST', '/documents/collection-type/showcase', {
    data: { seo: { social: { handle: 1 } }, gallery: [{ tags: 'x' }], featured: 'yes' },
  });
  expect(bad).toMatchObject({
    status: 400,
    body: {
      message: [
        'seo.social.handle must be a string',
        'gallery.0.tags must be an array',
        'featured must be a boolean',
      ],
    },
  });
});

test('D2 to D8 create, read, update, publish, duplicate and delete a document', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  const api = await signIn(page, mockApi);
  const base = '/documents/collection-type/blog';

  const created = await api('POST', base, { data: { title: 'Fresh', views: 1 } });
  expect(created).toMatchObject({
    status: 201,
    body: { data: { status: 'draft', title: 'Fresh' } },
  });
  const id = (created.body as { data: { documentId: string } }).data.documentId;

  expect((await api('GET', `${base}/${id}`)).body).toMatchObject({ data: { title: 'Fresh' } });
  expect((await api('POST', `${base}/${id}/publish`)).body).toEqual({ status: 'published' });
  expect((await api('PUT', `${base}/${id}`, { data: { title: 'Edited' } })).body).toMatchObject({
    data: { status: 'modified', title: 'Edited' },
  });
  expect((await api('POST', `${base}/${id}/unpublish`)).body).toEqual({ status: 'draft' });

  const copy = await api('POST', `${base}/${id}/duplicate`);
  expect(copy).toMatchObject({ status: 201, body: { data: { status: 'draft', title: 'Edited' } } });
  expect((copy.body as { data: { documentId: string } }).data.documentId).not.toBe(id);

  expect(await api('DELETE', `${base}/${id}`)).toEqual({ status: 204, body: null });
  expect((await api('GET', `${base}/${id}`)).status).toBe(404);
  expect(mockContent.documents('blog').map((doc) => doc.title)).toEqual([
    'Post 1',
    'Post 2',
    'Post 3',
    'Edited',
  ]);
  expect(mockContent.saves.map((save) => save.route)).toEqual(['D2', 'D4']);
});

test('unknown documents answer 404 on every document route', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  const api = await signIn(page, mockApi);
  const doc = '/documents/collection-type/blog/missing';

  for (const [method, path, body] of [
    ['GET', doc],
    ['PUT', doc, { data: {} }],
    ['DELETE', doc],
    ['POST', `${doc}/publish`],
    ['POST', `${doc}/unpublish`],
    ['POST', `${doc}/duplicate`],
  ] as const) {
    expect((await api(method, path, body)).status, `${method} ${path}`).toBe(404);
  }
  expect((await api('GET', '/documents/collection-type/nope')).status).toBe(404);
  expect((await api('GET', '/documents/collection-type/homepage')).status).toBe(404);
});

test('Mode B types answer 400 to publish and unpublish', async ({ page, mockApi, mockContent }) => {
  seedContent(mockContent);
  mockContent.addDocument('changelog', { ...blogPost(9), version: '1.0.0' });
  const api = await signIn(page, mockApi);
  const doc = `/documents/collection-type/${CHANGELOG.slug}/blog-9`;

  for (const action of ['publish', 'unpublish']) {
    expect(await api('POST', `${doc}/${action}`)).toMatchObject({
      status: 400,
      body: { message: 'Draft-to-publish is disabled for this content type' },
    });
  }
});

test('every action needs its global or slug-scoped permission', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  mockContent.addContentType({ ...BLOG, slug: 'news', name: 'News' });
  mockContent.addDocument('news', blogPost(5));
  const api = await signIn(
    page,
    mockApi,
    role(['content_type:read', 'document:read', 'document:update:blog', 'document:publish:blog']),
  );

  expect((await api('PUT', '/documents/collection-type/blog/blog-1', { data: {} })).status).toBe(
    200,
  );
  expect((await api('POST', '/documents/collection-type/blog/blog-1/publish')).status).toBe(200);
  for (const [method, path, body] of [
    ['PUT', '/documents/collection-type/news/blog-5', { data: {} }],
    ['POST', '/documents/collection-type/news/blog-5/publish'],
    ['POST', '/documents/collection-type/blog/blog-1/unpublish'],
    ['POST', '/documents/collection-type/blog', { data: {} }],
    ['POST', '/documents/collection-type/blog/blog-1/duplicate'],
    ['DELETE', '/documents/collection-type/blog/blog-1'],
    ['DELETE', '/documents/collection-type/blog/bulk', { documentIds: ['blog-1'] }],
    ['POST', '/documents/collection-type/blog/bulk', { items: [{ data: {} }] }],
    ['PUT', '/documents/single-type/homepage', { data: {} }],
  ] as const) {
    expect((await api(method, path, body)).status, `${method} ${path}`).toBe(403);
  }
});

test('D9 creates and publishes every item, or nothing when one is invalid', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  const api = await signIn(page, mockApi);
  const bulk = '/documents/collection-type/blog/bulk';

  const failed = await api('POST', bulk, {
    items: [{ data: { title: 'A' } }, { data: { title: 2 } }],
  });
  expect(failed).toMatchObject({
    status: 400,
    body: { message: ['items.1.title must be a string'] },
  });
  expect(mockContent.documents('blog')).toHaveLength(3);

  const ok = await api('POST', bulk, {
    items: [{ data: { title: 'A' } }, { data: { title: 'B' } }],
  });
  expect(ok).toMatchObject({
    status: 201,
    body: {
      items: [
        { data: { status: 'published', title: 'A' } },
        { data: { status: 'published', title: 'B' } },
      ],
    },
  });
  expect(mockContent.documents('blog')).toHaveLength(5);
  expect((await api('POST', bulk, { items: [] })).status).toBe(400);
});

test('D10 deletes what it can and reports each failure', async ({ page, mockApi, mockContent }) => {
  seedContent(mockContent);
  mockContent.failDelete('blog-2', 'Document is locked');
  const api = await signIn(page, mockApi);

  const res = await api('DELETE', '/documents/collection-type/blog/bulk', {
    documentIds: ['blog-1', 'blog-2', 'blog-3', 'missing'],
  });

  expect(res).toEqual({
    status: 200,
    body: {
      deleted: ['blog-1', 'blog-3'],
      failed: [
        { documentId: 'blog-2', error: 'Document is locked' },
        { documentId: 'missing', error: 'Document not found' },
      ],
    },
  });
  expect(mockContent.documents('blog').map((doc) => doc.documentId)).toEqual(['blog-2']);
  expect(
    (await api('DELETE', '/documents/collection-type/blog/bulk', { documentIds: [] })).status,
  ).toBe(400);
});

test('D1 sorts, searches, filters with every operator and rejects unknown columns', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  const api = await signIn(page, mockApi);
  const list = async (query: string) => {
    const res = await api('GET', `/documents/collection-type/blog?${query}`);
    return {
      status: res.status,
      titles: ((res.body as { items?: { data: { title?: string } }[] }).items ?? []).map(
        (item) => item.data.title,
      ),
      total: (res.body as { total?: number }).total,
    };
  };

  expect(await list('orderBy=views&sortDir=asc')).toEqual({
    status: 200,
    titles: ['Post 1', 'Post 2', 'Post 3'],
    total: 3,
  });
  expect((await list('search=post%202')).titles).toEqual(['Post 2']);
  expect((await list('filters[views][$gte]=20')).titles).toEqual(['Post 3', 'Post 2']);
  expect((await list('filters[views][$lt]=20')).titles).toEqual(['Post 1']);
  expect((await list('filters[featured][$eq]=true')).titles).toEqual(['Post 2']);
  expect((await list('filters[created_at][$gt]=2026-02-02')).titles).toEqual(['Post 3', 'Post 2']);
  expect((await list('filters[document_id][$ne]=blog-1')).titles).toEqual(['Post 3', 'Post 2']);
  expect((await list('filters[excerpt][$contains]=OF POST 3')).titles).toEqual(['Post 3']);
  expect((await list('size=2&start=2')).titles).toEqual(['Post 1']);
  expect((await list('orderBy=body')).status).toBe(400);
  expect((await list('filters[status][$eq]=draft')).status).toBe(400);
  expect((await list('filters[featured][$gt]=true')).status).toBe(400);
});

test('a read grant scoped to one type reads that type only (AC-41)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  const api = await signIn(page, mockApi, role(['content_type:read', 'document:read:homepage']));

  // Allowed: the never-saved homepage answers 404, not 403.
  expect((await api('GET', '/documents/single-type/homepage')).status).toBe(404);
  expect((await api('GET', '/documents/collection-type/blog')).status).toBe(403);
  expect((await api('GET', '/documents/collection-type/blog/blog-1')).status).toBe(403);
});
