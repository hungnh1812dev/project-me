import { BLOG, blogPost, HOMEPAGE, seedContent } from './fixtures/contentFixtures.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';
import type { MockContent } from './fixtures/mockContent.ts';

// The collection list (SPEC "Collection list"): URL state, the table, sort, search, pagination and
// states (AC-4, AC-19 to AC-21, AC-23, AC-24). It also holds the list checks that used to live in
// content-types.spec.ts: the scoped 403, the 401 refresh and the sort read from the URL (AC-41).

const URL = '/admin/content-types/blog';
const D1 = '/api/v1/documents/collection-type/blog';
const IGNORED = 'Some filters in the link were ignored.';

function signedInAs(mockApi: MockApi, role = ROLES.superAdmin) {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role });
  mockApi.signInAs('jane@example.com');
}

/** The blog type with `count` posts (ids 1..count). */
function seedPosts(content: MockContent, count: number) {
  content.addContentType(BLOG);
  for (let n = 1; n <= count; n += 1) content.addDocument('blog', blogPost(n));
}

/** The query strings of every D1 request for the blog, in order. */
const listQueries = (mockApi: MockApi) =>
  mockApi.requests
    .filter((r) => r.method === 'GET' && r.path.startsWith(D1) && !r.path.startsWith(`${D1}/`))
    .map((r) => r.path.slice(D1.length));

const query = (url: string) => new globalThis.URL(url).searchParams;

test('unknown params are dropped, the URL is rewritten in place and the page says so (AC-4)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto('/admin/content-types');
  await expect(page.getByRole('heading', { level: 1, name: 'Content types' })).toBeVisible();

  await page.goto(`${URL}?orderBy=coverImage&filters[nope][$eq]=1&sortDir=asc`);

  await expect(page.getByRole('table', { name: 'Blog post entries' })).toBeVisible();
  await expect(page).toHaveURL(`${URL}?sortDir=asc`);
  await expect(page.getByText(IGNORED)).toHaveAttribute('role', 'status');
  expect(listQueries(mockApi)).toEqual(['?size=10&sortDir=asc']);

  // The rewrite replaced the entry: Back returns to the overview.
  await page.goBack();
  await expect(page).toHaveURL('/admin/content-types');
});

test('a non-identifier orderBy is dropped before any request (AC-4)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);

  await page.goto(`${URL}?orderBy=x%5D%5B%24ne`);

  await expect(page).toHaveURL(URL);
  await expect(page.getByText(IGNORED)).toBeAttached();
  await expect(page.getByRole('table', { name: 'Blog post entries' })).toBeVisible();
  expect(listQueries(mockApi)).toEqual(['?size=10']);
});

test('the table shows the listFields, Status and formatted cells, and links each entry (AC-19)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);

  await page.goto(URL);

  const table = page.getByRole('table', { name: 'Blog post entries' });
  await expect(table.getByRole('columnheader')).toHaveText([
    'Select all entries on this page',
    'Title',
    'Views',
    'Featured',
    'Updated',
    'Status',
    'Actions',
  ]);
  const rows = table.getByRole('row');
  await expect(rows).toHaveCount(4);
  const post2 = rows.nth(2).getByRole('cell');
  await expect(post2.nth(1)).toHaveText('Post 2');
  await expect(post2.nth(2)).toHaveText('20');
  await expect(post2.nth(3)).toHaveText('Yes');
  await expect(post2.nth(4).locator('time')).toHaveAttribute('title', '2026-02-02T09:00:00.000Z');
  await expect(post2.nth(5)).toHaveText('Published');
  await expect(rows.nth(1).getByRole('cell').nth(5)).toHaveText('Modified');
  await expect(rows.nth(3).getByRole('cell').nth(3)).toHaveText('No');

  await table.getByRole('link', { name: 'Post 2' }).click();
  await expect(page).toHaveURL(`${URL}/blog-2`);
});

test('the sort is read from the URL and sent with wire names (AC-20, AC-41)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);

  await page.goto(`${URL}?orderBy=createdAt&sortDir=asc`);

  const rows = page.getByRole('table', { name: 'Blog post entries' }).getByRole('row');
  await expect(rows.nth(1)).toContainText('Post 1');
  expect(listQueries(mockApi)).toEqual(['?size=10&orderBy=created_at&sortDir=asc']);
});

test('clicking sortable headers sorts, writes the URL and clears the selection (AC-20)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(URL);
  const table = page.getByRole('table', { name: 'Blog post entries' });
  await table.getByRole('checkbox', { name: 'Select Post 2' }).check();

  await table.getByRole('button', { name: 'Views' }).click();

  await expect(page).toHaveURL(`${URL}?orderBy=views`);
  await expect(table.getByRole('columnheader', { name: 'Views' })).toHaveAttribute(
    'aria-sort',
    'descending',
  );
  await expect(table.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(table.getByRole('row').nth(1)).toContainText('Post 3');

  await table.getByRole('button', { name: 'Views' }).click();
  await expect(page).toHaveURL(`${URL}?orderBy=views&sortDir=asc`);
  await expect(table.getByRole('row').nth(1)).toContainText('Post 1');

  await table.getByRole('button', { name: 'Updated' }).click();
  await expect(page).toHaveURL(`${URL}?orderBy=updatedAt`);
  await expect(table.getByRole('columnheader', { name: 'Updated' })).toHaveAttribute(
    'aria-sort',
    'descending',
  );
  await expect(table.getByRole('columnheader', { name: 'Views' })).toHaveAttribute(
    'aria-sort',
    'none',
  );
  await expect(table.getByRole('button', { name: 'Status' })).toHaveCount(0);
  await expect(table.getByRole('button', { name: 'Featured' })).toHaveCount(1);
  await expect
    .poll(() => listQueries(mockApi))
    .toEqual([
      '?size=10',
      '?size=10&orderBy=views',
      '?size=10&orderBy=views&sortDir=asc',
      '?size=10&orderBy=updated_at',
    ]);
});

test('search sends one debounced request, resets the page, writes q and survives a reload (AC-21)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedPosts(mockContent, 25);
  signedInAs(mockApi);
  await page.goto(`${URL}?page=2`);
  await expect(page.getByText('Showing 11–20 of 25')).toBeVisible();

  const box = page.getByRole('searchbox', { name: 'Search entries' });
  await box.pressSequentially('Post 2', { delay: 30 });

  await expect.poll(() => query(page.url()).get('q')).toBe('Post 2');
  expect(query(page.url()).has('page')).toBe(false);
  await expect(page.getByText('Showing 1–7 of 7')).toBeVisible();
  const searches = listQueries(mockApi).filter((q) => q.includes('search='));
  expect(searches).toEqual(['?size=10&search=Post+2']);

  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search entries' })).toHaveValue('Post 2');
  await expect(page.getByText('Showing 1–7 of 7')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Blog post entries' }).getByRole('row')).toHaveCount(
    8,
  );
});

test('pagination shows 10 rows by default, moves between pages, changes the size and clamps a page past the end (AC-23, AC-20, AC-27)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedPosts(mockContent, 25);
  signedInAs(mockApi);
  await page.goto(URL);

  const pagination = page.getByRole('navigation', { name: 'Pagination' });
  await expect(pagination.getByText('Showing 1–10 of 25')).toBeVisible();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(11); // header + 10 rows
  expect(listQueries(mockApi)).toEqual(['?size=10']);
  await expect(page).toHaveURL(URL);
  await expect(pagination.getByRole('button', { name: 'Previous page' })).toBeDisabled();

  const next = pagination.getByRole('button', { name: 'Next page' });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${URL}?page=2`);
  await expect(pagination.getByText('Showing 11–20 of 25')).toBeVisible();
  await expect(pagination.getByText('Page 2 of 3')).toBeVisible();
  await expect(next).toBeFocused();
  expect(query(`http://x${listQueries(mockApi).at(-1)}`).get('start')).toBe('10');

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${URL}?page=3`);
  await expect(pagination.getByText('Showing 21–25 of 25')).toBeVisible();
  await expect(next).toBeDisabled();
  await expect(pagination.getByRole('button', { name: 'Previous page' })).toBeFocused();

  const sizeSelect = pagination.getByRole('combobox', { name: 'Rows per page' });
  await sizeSelect.click();
  await page.getByRole('option', { name: '20', exact: true }).click();
  await expect(page).toHaveURL(`${URL}?size=20`);
  await expect(pagination.getByText('Showing 1–20 of 25')).toBeVisible();
  await expect(sizeSelect).toBeFocused();

  await page.goto(`${URL}?page=9`);
  await expect(page).toHaveURL(`${URL}?page=3`);
  await expect(pagination.getByText('Showing 21–25 of 25')).toBeVisible();
});

test('an empty collection says so and offers Create entry (AC-24)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  mockContent.addContentType(BLOG);
  signedInAs(mockApi);

  await page.goto(URL);

  await expect(page.getByText('No entries yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create entry' })).toHaveCount(2);
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('a search with no match offers to clear it (AC-24)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);

  await page.goto(`${URL}?q=zzz`);

  await expect(page.getByText('No entries match your search or filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await expect(page).toHaveURL(URL);
  await expect(page.getByRole('searchbox', { name: 'Search entries' })).toHaveValue('');
  await expect(page.getByRole('table', { name: 'Blog post entries' }).getByRole('row')).toHaveCount(
    4,
  );
});

test('the list shows skeleton rows while it loads (AC-24)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**${D1}*`, async (route) => {
    await gate;
    await route.fallback();
  });

  await page.goto(URL);

  await expect(page.getByRole('group', { name: 'Loading entries' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  release();
  await expect(page.getByRole('table', { name: 'Blog post entries' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Loading entries' })).toHaveCount(0);
});

test('a failed load shows the error with Retry, and Retry reloads (AC-24)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  // The query retries a 5xx once, so both attempts fail.
  mockApi.failNext('GET', '/documents/collection-type/blog', 500, 2);

  await page.goto(URL);

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Forced 500');
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('table', { name: 'Blog post entries' })).toBeVisible();
});

test('a server 403 on the list shows the no-access state (AC-24)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  mockApi.failNext('GET', '/documents/collection-type/blog', 403);

  await page.goto(URL);

  await expect(page.getByRole('alert')).toHaveText("You don't have access to Blog post entries.");
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
});

test('a user scoped to one content type sees the no-access state on another (AC-41)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi, {
    ...ROLES.contentEditor,
    permissions: ['content_type:read', `document:read:${HOMEPAGE.slug}`],
  });

  await page.goto(`/admin/content-types/${HOMEPAGE.slug}`);
  await expect(page.getByText('Not saved yet')).toBeVisible();

  await page.goto(URL);
  await expect(page.getByRole('alert')).toHaveText("You don't have access to Blog post entries.");
  expect(mockApi.requests.filter((r) => r.path.includes('/collection-type/'))).toEqual([]);
});

test('the list recovers transparently when the access token expires (AC-41)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto('/admin/content-types');
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: 'Blog post' })).toBeVisible();
  const before = mockApi.requests.length;

  mockApi.expireAccessTokens();
  await main.getByRole('link', { name: 'Blog post' }).click();

  await expect(page.getByText('Showing 1–3 of 3')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(mockApi.requests.slice(before).map((r) => `${r.method} ${r.path} ${r.status}`)).toEqual([
    'GET /api/v1/content-types/blog 401',
    'POST /api/v1/auth/refresh 200',
    'GET /api/v1/content-types/blog 200',
    `GET ${D1}?size=10 200`,
  ]);
});

test('at 375px the table scrolls inside its region, not the page', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto(URL);

  const region = page.getByRole('region', { name: 'Blog post entries' });
  await expect(region.getByRole('row')).toHaveCount(4);
  const overflow = await region.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(true);
  const pageScroll = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(pageScroll).toBeLessThanOrEqual(0);
});

test('the overview groups content types by kind and links each to its page (AC-41)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi, ROLES.contentEditor);

  await page.goto('/admin/content-types');

  const single = page.getByRole('region', { name: 'Single types' });
  const collection = page.getByRole('region', { name: 'Collection types' });
  await expect(single.getByRole('link', { name: 'Homepage' })).toBeVisible();
  await expect(collection.getByRole('link', { name: 'Blog post' })).toBeVisible();
  await expect(single.getByRole('listitem')).toContainText('Single type');
  const blog = collection.getByRole('listitem').filter({ hasText: 'Blog post' });
  await expect(blog).toContainText('Collection type');
  await expect(blog).toContainText('Draft & publish');

  await collection.getByRole('link', { name: 'Blog post' }).click();
  await expect(page).toHaveURL(URL);
  await expect(page.getByRole('heading', { level: 1, name: 'Blog post' })).toBeVisible();
});
