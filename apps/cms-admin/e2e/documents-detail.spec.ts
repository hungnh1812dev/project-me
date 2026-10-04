import type { Page } from '@playwright/test';

import { blogPost, seedContent } from './fixtures/contentFixtures.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

// The create and detail pages, row actions and the unsaved-changes guard (SPEC "Detail and create
// pages", "Row actions"; AC-16, AC-26 to AC-29, AC-39).

const LIST = '/admin/content-types/blog';
const SCHEMA_FIELDS = ['body', 'cover', 'excerpt', 'featured', 'title', 'views'];

function signedInAs(mockApi: MockApi, role = ROLES.superAdmin) {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role });
  mockApi.signInAs('jane@example.com');
}

const trail = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' });
const main = (page: Page) => page.getByRole('main');
const discardDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });

/** Whether a `beforeunload` right now would ask before leaving. */
const beforeUnloadArmed = (page: Page) =>
  page.evaluate<boolean>(`(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);

const dataKeys = (body: unknown) =>
  Object.keys((body as { data: Record<string, unknown> }).data).sort();

test('create sends D2 with schema fields only, replaces the URL and announces it (AC-26)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(LIST);

  await main(page).getByRole('link', { name: 'Create entry' }).click();
  await expect(page).toHaveURL(`${LIST}/new`);
  await expect(main(page).getByRole('heading', { level: 1, name: 'New entry' })).toBeVisible();
  await expect(trail(page).getByRole('listitem')).toHaveText([
    'Home',
    'Content types',
    'Blog post',
    'New entry',
  ]);
  await page.getByLabel('Title', { exact: true }).fill('Fresh post');
  await page.getByLabel('Views').fill('7');
  await main(page).getByRole('button', { name: 'Save' }).click();

  await expect(main(page).getByRole('heading', { level: 1, name: 'Fresh post' })).toBeVisible();
  await expect(page.getByText('Entry created.')).toBeAttached();
  await expect(discardDialog(page)).toHaveCount(0);
  const created = mockContent.documents('blog').at(-1)!;
  await expect(page).toHaveURL(`${LIST}/${created.documentId}`);
  const save = mockContent.saves.at(-1)!;
  expect(save.route).toBe('D2');
  expect(dataKeys(save.body)).toEqual(SCHEMA_FIELDS);
  expect((save.body as { data: Record<string, unknown> }).data).toMatchObject({
    title: 'Fresh post',
    views: 7,
  });

  // `replace`: Back skips the empty form and returns to the list.
  await page.goBack();
  await expect(page).toHaveURL(LIST);
  await expect(discardDialog(page)).toHaveCount(0);
});

test('the detail page loads D3, saves D4 with schema fields only, and a published entry becomes Modified (AC-27, AC-39)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(LIST);

  await main(page).getByRole('link', { name: 'Post 2' }).click();

  await expect(page).toHaveURL(`${LIST}/blog-2`);
  const heading = main(page).getByRole('heading', { level: 1, name: 'Post 2' });
  await expect(heading).toBeVisible();
  await expect(page).toHaveTitle('Post 2 · CMS Admin');
  await expect(trail(page).getByRole('listitem')).toHaveText([
    'Home',
    'Content types',
    'Blog post',
    'Post 2',
  ]);
  const header = main(page).locator('header');
  await expect(header.getByText('Published', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Post 2');

  await page.getByLabel('Title', { exact: true }).fill('Post 2 revised');
  await main(page).getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Saved.')).toBeAttached();
  await expect(main(page).getByRole('heading', { level: 1, name: 'Post 2 revised' })).toBeVisible();
  await expect(header.getByText('Modified', { exact: true })).toBeVisible();
  await expect(trail(page).getByRole('listitem').last()).toHaveText('Post 2 revised');
  const save = mockContent.saves.at(-1)!;
  expect(save).toMatchObject({ route: 'D4', documentId: 'blog-2' });
  expect(dataKeys(save.body)).toEqual(SCHEMA_FIELDS);
});

test('a missing entry and a forbidden entry each show their state (AC-27)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);

  await page.goto(`${LIST}/nope`);
  await expect(main(page).getByRole('alert')).toHaveText(
    "This entry doesn't exist or was deleted.",
  );
  await main(page).getByRole('link', { name: 'Back to Blog post' }).click();
  await expect(page).toHaveURL(LIST);

  mockApi.failNext('GET', '/documents/collection-type/blog/blog-1', 403);
  await page.goto(`${LIST}/blog-1`);
  await expect(main(page).getByRole('alert')).toHaveText("You don't have access to this entry.");
});

test('an unknown content type links back to the overview', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);

  await page.goto('/admin/content-types/nope/blog-1');

  await expect(main(page).getByRole('alert')).toHaveText('Content type not found.');
  await main(page).getByRole('link', { name: 'Back to content types' }).click();
  await expect(page).toHaveURL('/admin/content-types');
});

test('publish and unpublish on the detail page follow the status (AC-27)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(`${LIST}/blog-1`);
  const header = main(page).locator('header');

  await main(page).getByRole('button', { name: 'Publish' }).click();
  await expect(header.getByText('Published', { exact: true })).toBeVisible();
  await expect(page.getByText('Published.', { exact: true })).toBeAttached();

  await main(page).getByRole('button', { name: 'Unpublish' }).click();
  await expect(header.getByText('Draft', { exact: true })).toBeVisible();
});

test('duplicate and delete from the detail page (AC-28)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(`${LIST}/blog-1`);
  await expect(main(page).getByRole('heading', { level: 1, name: 'Post 1' })).toBeVisible();

  await main(page).getByRole('button', { name: 'Duplicate' }).click();

  await expect(page.getByText('Copy created.')).toBeAttached();
  const copy = mockContent.documents('blog').at(-1)!;
  expect(copy.documentId).not.toBe('blog-1');
  await expect(page).toHaveURL(`${LIST}/${copy.documentId}`);
  await expect(main(page).getByRole('heading', { level: 1, name: 'Post 1' })).toBeVisible();
  await expect(main(page).locator('header').getByText('Draft', { exact: true })).toBeVisible();

  await main(page).getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete "Post 1"?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Delete entry' }).click();

  await expect(page).toHaveURL(LIST);
  await expect(page.getByText('Entry deleted.')).toBeAttached();
  expect(mockContent.documents('blog').map((d) => d.documentId)).not.toContain(copy.documentId);
  await expect(main(page).getByRole('link', { name: 'Post 1' })).toHaveCount(1);
});

test('duplicate and delete from a row (AC-28)', async ({ page, mockApi, mockContent }) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(LIST);
  const table = page.getByRole('table', { name: 'Blog post entries' });
  await expect(table.getByRole('row')).toHaveCount(4);

  await table.getByRole('button', { name: 'Actions for Post 3' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();

  await expect(page.getByText('Copy of "Post 3" created.')).toBeAttached();
  await expect(table.getByRole('row')).toHaveCount(5);
  await expect(table.getByRole('link', { name: 'Post 3' })).toHaveCount(2);

  await table.getByRole('button', { name: 'Actions for Post 1' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete "Post 1"?' });
  await dialog.getByRole('button', { name: 'Delete entry' }).click();

  await expect(page.getByText('"Post 1" deleted.')).toBeAttached();
  await expect(table.getByRole('link', { name: 'Post 1' })).toHaveCount(0);
  expect(mockContent.documents('blog').map((d) => d.documentId)).not.toContain('blog-1');
});

test('row Publish and Unpublish follow the status, and the badge updates (AC-29)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(LIST);
  const table = page.getByRole('table', { name: 'Blog post entries' });
  const row = (name: string) => table.getByRole('row').filter({ hasText: name });

  await table.getByRole('button', { name: 'Actions for Post 1' }).click();
  await expect(page.getByRole('menuitem', { name: 'Unpublish' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Publish', exact: true }).click();
  await expect(row('Post 1').getByText('Published', { exact: true })).toBeVisible();

  await table.getByRole('button', { name: 'Actions for Post 2' }).click();
  await expect(page.getByRole('menuitem', { name: 'Publish', exact: true })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Unpublish' }).click();
  await expect(row('Post 2').getByText('Draft', { exact: true })).toBeVisible();
});

test('a server 403 on a row action shows "no access" and the session continues (AC-33)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(LIST);

  mockApi.failNext('POST', '/documents/collection-type/blog/blog-1/publish', 403);
  await page.getByRole('button', { name: 'Actions for Post 1' }).click();
  await page.getByRole('menuitem', { name: 'Publish', exact: true }).click();

  await expect(main(page).getByRole('alert')).toHaveText("You don't have access to do this.");
  await expect(page.getByRole('table', { name: 'Blog post entries' })).toBeVisible();
});

test('leaving a dirty form asks first, on a link and on Back; Cancel stays and Discard leaves (AC-16)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(LIST);
  await main(page).getByRole('link', { name: 'Post 1' }).click();
  await expect(main(page).getByRole('heading', { level: 1, name: 'Post 1' })).toBeVisible();
  expect(await beforeUnloadArmed(page)).toBe(false);

  const title = page.getByLabel('Title', { exact: true });
  await title.fill('Post 1 edited');
  // The listener is added by an effect after the dirty render, so wait for it.
  await expect.poll(() => beforeUnloadArmed(page)).toBe(true);

  // A link: Cancel keeps the edits.
  await trail(page).getByRole('link', { name: 'Blog post' }).click();
  await expect(discardDialog(page)).toBeVisible();
  await discardDialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(discardDialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(`${LIST}/blog-1`);
  await expect(title).toHaveValue('Post 1 edited');

  // Back: Discard leaves.
  await page.evaluate('history.back()');
  await expect(discardDialog(page)).toBeVisible();
  await discardDialog(page).getByRole('button', { name: 'Discard' }).click();
  await expect(page).toHaveURL(LIST);
  expect(await beforeUnloadArmed(page)).toBe(false);
  expect(mockContent.saves).toHaveLength(0);
});

test('a just-saved form leaves without asking (AC-16)', async ({ page, mockApi, mockContent }) => {
  seedContent(mockContent);
  mockContent.addDocument('blog', blogPost(4));
  signedInAs(mockApi);
  await page.goto(`${LIST}/blog-4`);

  await page.getByLabel('Title', { exact: true }).fill('Post 4 edited');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeAttached();
  expect(await beforeUnloadArmed(page)).toBe(false);

  await trail(page).getByRole('link', { name: 'Blog post' }).click();
  await expect(page).toHaveURL(LIST);
  await expect(discardDialog(page)).toHaveCount(0);
});

test('at 375px the detail actions sit in a bottom bar with a "More actions" menu (AC-38)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(`${LIST}/blog-2`);

  const bar = main(page).getByRole('group', { name: 'Entry actions' });
  await expect(bar.getByRole('button', { name: 'Save' })).toBeInViewport();
  await expect(bar.getByRole('button', { name: 'Duplicate' })).toBeHidden();
  const box = await bar.boundingBox();
  expect(box!.y + box!.height).toBeCloseTo(740, 0);

  await bar.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Unpublish' }).click();
  await expect(main(page).locator('header').getByText('Draft', { exact: true })).toBeVisible();
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow).toBe(0);
});

test('at 375px the bottom bar stays in view at the end of a long form and covers no field (AC-38)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  await page.setViewportSize({ width: 375, height: 640 });
  seedContent(mockContent);
  mockContent.addDocument('showcase', {
    documentId: 'show-1',
    status: 'draft',
    createdAt: '2026-02-01T09:00:00.000Z',
    updatedAt: '2026-02-01T09:00:00.000Z',
    updatedBy: null,
    title: 'Every field',
  });
  signedInAs(mockApi);
  await page.goto('/admin/content-types/showcase/show-1');
  await expect(main(page).getByRole('heading', { level: 1, name: 'Every field' })).toBeVisible();
  const bar = main(page).getByRole('group', { name: 'Entry actions' });
  const last = page.getByRole('textbox', { name: 'Location' });

  await last.scrollIntoViewIfNeeded();
  await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');

  await expect(bar.getByRole('button', { name: 'Save' })).toBeInViewport();
  const barTop = (await bar.boundingBox())!.y;
  const lastBox = (await last.boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(barTop);
});
