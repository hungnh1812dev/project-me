import type { ContentType } from '../src/features/content/types.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

/** The pages inside the shell get a light Card, Table and Badge restyle (AC-38, AC-39). */
const STAMP = '2026-01-01T00:00:00.000Z';
const ARTICLE: ContentType = {
  documentId: 'ct-article',
  slug: 'article',
  name: 'Article',
  kind: 'collection',
  draftToPublish: true,
  fields: [{ name: 'title', type: 'text', header: true }],
  listFields: ['title'],
  createdAt: STAMP,
  updatedAt: STAMP,
};

function signedInAs(mockApi: MockApi, role = ROLES.contentEditor) {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role });
  mockApi.signInAs('jane@example.com');
}

const card = '[data-slot="card"]';

test('the admin home is a welcome card with a profile link (AC-38)', async ({ page, mockApi }) => {
  signedInAs(mockApi);
  await page.goto('/admin');

  const welcome = page.getByRole('main').locator(card);
  await expect(welcome.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();
  await welcome.getByRole('link', { name: 'Your profile' }).click();
  await expect(page).toHaveURL('/admin/profile');
});

test('the profile is a card with the permissions in mono font (AC-4, AC-38)', async ({
  page,
  mockApi,
}) => {
  signedInAs(mockApi, ROLES.editor);
  await page.goto('/admin/profile');

  const profile = page.getByRole('main').locator(card);
  await expect(profile.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await expect(profile.getByRole('list', { name: 'Permissions' })).toHaveCSS(
    'font-family',
    /Fira Code/,
  );
  await expect(profile.getByRole('button', { name: 'Log out' })).toBeVisible();
});

test('the content-type pages use cards and a table (AC-39)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  mockContent.addContentType(ARTICLE);
  mockContent.addDocument('article', {
    documentId: 'doc-1',
    status: 'draft',
    createdAt: STAMP,
    updatedAt: STAMP,
    updatedBy: null,
    title: 'Hello',
  });
  signedInAs(mockApi);
  await page.goto('/admin/content-types');

  const collection = page.getByRole('region', { name: 'Collection types' });
  await expect(collection.locator(card)).toBeVisible();
  await collection.getByRole('link', { name: 'Article' }).click();

  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Article' })).toBeVisible();
  await expect(main.getByRole('table', { name: 'Article entries' })).toHaveAttribute(
    'data-slot',
    'table',
  );
});
