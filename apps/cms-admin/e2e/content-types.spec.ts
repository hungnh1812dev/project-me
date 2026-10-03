import type { ContentType, Document } from '../src/features/content/types.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';
import type { MockContent } from './fixtures/mockContent.ts';

const STAMP = '2026-01-01T00:00:00.000Z';

const ARTICLE: ContentType = {
  documentId: 'ct-article',
  slug: 'article',
  name: 'Article',
  kind: 'collection',
  draftToPublish: true,
  fields: [
    { name: 'title', type: 'text', header: true },
    { name: 'body', type: 'richtext' },
  ],
  listFields: ['title', 'createdAt'],
  createdAt: STAMP,
  updatedAt: STAMP,
};

const HOME: ContentType = {
  ...ARTICLE,
  documentId: 'ct-home',
  slug: 'home',
  name: 'Home',
  kind: 'single',
  fields: [{ name: 'headline', type: 'text' }],
  listFields: ['headline'],
};

function article(documentId: string, title: string, createdAt: string): Document {
  return {
    documentId,
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
    updatedBy: null,
    title,
    body: '<p>Not listed</p>',
  };
}

/** Article (two documents, the older one added last) and Home (never saved). */
function seed(content: MockContent) {
  content.addContentType(ARTICLE);
  content.addContentType(HOME);
  content.addDocument('article', article('doc-new', 'Newer post', '2026-03-01T00:00:00.000Z'));
  content.addDocument('article', article('doc-old', 'Older post', '2026-02-01T00:00:00.000Z'));
}

function calls(mockApi: MockApi) {
  return mockApi.requests.map((r) => `${r.method} ${r.path} ${r.status}`);
}

function signedInAs(mockApi: MockApi, role = ROLES.contentEditor) {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role });
  mockApi.signInAs('jane@example.com');
}

test('lists content types grouped by kind for a user with access', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seed(mockContent);
  signedInAs(mockApi);

  await page.goto('/admin/content-types');

  const single = page.getByRole('region', { name: 'Single types' });
  const collection = page.getByRole('region', { name: 'Collection types' });
  await expect(single.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(collection.getByRole('link', { name: 'Article' })).toBeVisible();
  await expect(single.getByRole('listitem')).toContainText('Single type');
  await expect(collection.getByRole('listitem')).toContainText('Collection type');
  await expect(collection.getByRole('listitem')).toContainText('Draft & publish');

  await collection.getByRole('link', { name: 'Article' }).click();
  await expect(page).toHaveURL('/admin/content-types/article');
  await expect(page.getByRole('heading', { level: 1, name: 'Article' })).toBeVisible();
});

test('sends a user without content_type:read to /403', async ({ page, mockApi, mockContent }) => {
  seed(mockContent);
  signedInAs(mockApi, ROLES.editor);

  await page.goto('/admin/content-types');

  await expect(page).toHaveURL('/403');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  expect(calls(mockApi).filter((call) => call.includes('/content-types'))).toEqual([]);
});

test('the mock forbids a document read outside the scoped permission', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seed(mockContent);
  const scoped = {
    ...ROLES.contentEditor,
    permissions: ['content_type:read', 'document:read:home'],
  };
  signedInAs(mockApi, scoped);

  // The client never sends this request (it is denied locally), so the fixture is checked directly
  // with the token the app holds, read from a request it makes.
  const token = page.waitForRequest('**/api/v1/content-types');
  await page.goto('/admin/content-types');
  const authorization = (await token).headers()['authorization']!;

  const status = await page.evaluate(async (header) => {
    const res = await fetch('/api/v1/documents/collection-type/article', {
      headers: { authorization: header },
    });
    return res.status;
  }, authorization);
  expect(status).toBe(403);
});
