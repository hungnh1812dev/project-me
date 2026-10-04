import type { Page } from '@playwright/test';

import { blogPost, seedContent } from './fixtures/contentFixtures.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

// The bulk action bar (SPEC "Bulk bar"; AC-30, AC-31): a bulk delete with a partial failure, a bulk
// publish over mixed statuses with a failure in the middle, and Mode B hiding the publish buttons.

const LIST = '/admin/content-types/blog';
const LIST_PATH = '/api/v1/documents/collection-type/blog';

function signedInAs(mockApi: MockApi, role = ROLES.superAdmin) {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role });
  mockApi.signInAs('jane@example.com');
}

const main = (page: Page) => page.getByRole('main');
const bar = (page: Page) => page.getByRole('region', { name: 'Bulk actions' });
const box = (page: Page, label: string) => page.getByRole('checkbox', { name: `Select ${label}` });
const row = (page: Page, label: string) => page.getByRole('row').filter({ has: box(page, label) });

async function select(page: Page, ...labels: string[]) {
  for (const label of labels) await box(page, label).check();
}

test('bulk delete of 3 entries with 1 failure summarises, keeps the failed row selected and removes the others (AC-30)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  mockContent.failDelete('blog-2', 'Entry is locked.');
  signedInAs(mockApi);
  await page.goto(LIST);

  await select(page, 'Post 1', 'Post 2', 'Post 3');
  await expect(bar(page).getByText('3 selected')).toBeVisible();
  await bar(page).getByRole('button', { name: 'Delete selected' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete 3 entries?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete entries' }).click();

  const summary = main(page).getByRole('alert');
  await expect(summary).toContainText('2 of 3 entries deleted.');
  await expect(summary.getByRole('listitem')).toHaveText(['Post 2: Entry is locked.']);
  await expect(dialog).toHaveCount(0);
  await expect(box(page, 'Post 1')).toHaveCount(0);
  await expect(box(page, 'Post 3')).toHaveCount(0);
  await expect(box(page, 'Post 2')).toBeChecked();
  await expect(bar(page).getByText('1 selected')).toBeVisible();
  expect(mockContent.documents('blog').map((doc) => doc.documentId)).toEqual(['blog-2']);
  expect(mockApi.requests.filter((r) => r.method === 'DELETE').map((r) => r.path)).toEqual([
    `${LIST_PATH}/bulk`,
  ]);
});

test('bulk publish skips published entries, runs one at a time past a failure, shows progress and a summary (AC-31)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  mockContent.addDocument('blog', blogPost(4));
  signedInAs(mockApi);
  await page.goto(LIST);
  await expect(box(page, 'Post 4')).toBeVisible();

  // The list shows the newest first (Post 4, 3, 2, 1). Hold the first D6 so the progress line can
  // be read, and fail the second one with a 403.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v1/documents/collection-type/blog/blog-4/publish', async (route) => {
    await held;
    await route.fallback();
  });
  mockApi.failNext('POST', '/documents/collection-type/blog/blog-3/publish', 403);

  await select(page, 'Post 1', 'Post 2', 'Post 3', 'Post 4');
  const listReadsBefore = mockApi.requests.filter(
    (r) => r.method === 'GET' && r.path.startsWith(LIST_PATH),
  ).length;
  await bar(page).getByRole('button', { name: 'Publish selected', exact: true }).click();

  await expect(main(page).getByText('Publishing 1 of 3…')).toBeVisible();
  const publishes = () =>
    mockApi.requests
      .filter((r) => r.method === 'POST' && r.path.endsWith('/publish'))
      .map((r) => r.path.replace(`${LIST_PATH}/`, ''));
  // One at a time: nothing else is sent while the first one is in flight.
  expect(publishes()).toEqual([]);
  release();

  const summary = main(page).getByRole('alert');
  await expect(summary).toContainText('2 of 3 entries published. 1 skipped: already published.');
  await expect(summary.getByRole('listitem')).toHaveText([
    "Post 3: You don't have access to do this.",
  ]);
  expect(publishes()).toEqual(['blog-4/publish', 'blog-3/publish', 'blog-1/publish']);
  await expect(row(page, 'Post 1')).toContainText('Published');
  await expect(row(page, 'Post 4')).toContainText('Published');
  await expect(row(page, 'Post 3')).toContainText('Modified');
  // The lists are invalidated once, at the end: one list refetch for the whole run.
  const listReads = () =>
    mockApi.requests.filter((r) => r.method === 'GET' && r.path.startsWith(LIST_PATH)).length -
    listReadsBefore;
  await expect.poll(listReads).toBe(1);
  await expect(bar(page).getByText('4 selected')).toBeVisible();
  // The session continues after the 403.
  await expect(page).toHaveURL(LIST);
});

test('bulk unpublish skips drafts and announces a clean summary (AC-31)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(LIST);

  await select(page, 'Post 1', 'Post 2');
  await bar(page).getByRole('button', { name: 'Unpublish selected' }).click();

  await expect(
    main(page).getByText('1 entry unpublished. 1 skipped: already unpublished.').first(),
  ).toBeVisible();
  await expect(main(page).getByRole('alert')).toHaveCount(0);
  await expect(row(page, 'Post 2')).toContainText('Draft');
});

test('in Mode B the bulk publish buttons are hidden, and Delete selected stays (AC-31)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  mockContent.addDocument('changelog', {
    documentId: 'log-1',
    status: 'published',
    createdAt: '2026-02-01T09:00:00.000Z',
    updatedAt: '2026-02-01T09:00:00.000Z',
    updatedBy: null,
    version: '1.0.0',
    notes: '<p>First</p>',
  });
  signedInAs(mockApi);
  await page.goto('/admin/content-types/changelog');

  await select(page, '1.0.0');

  await expect(bar(page).getByText('1 selected')).toBeVisible();
  await expect(bar(page).getByRole('button', { name: 'Delete selected' })).toBeVisible();
  await expect(
    bar(page).getByRole('button', { name: 'Publish selected', exact: true }),
  ).toHaveCount(0);
  await expect(bar(page).getByRole('button', { name: 'Unpublish selected' })).toHaveCount(0);
});
