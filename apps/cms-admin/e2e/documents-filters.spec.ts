import type { Locator, Page } from '@playwright/test';

import { CONTENT_MANAGER, seedContent } from './fixtures/contentFixtures.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

// Filters, the date picker and the column chooser on the collection list (AC-22, AC-25). Dates are
// local midnight in the browser, so the spec pins the time zone to UTC to fix the ISO wire value.

test.use({ timezoneId: 'UTC', locale: 'en-US' });

const URL = '/admin/content-types/blog';
const D1 = '/api/v1/documents/collection-type/blog';
const C3 = '/api/v1/content-types/blog/list-fields';

function signedInAs(mockApi: MockApi, role = ROLES.superAdmin) {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role });
  mockApi.signInAs('jane@example.com');
}

/** The decoded query strings of every D1 list request, in order. */
const listQueries = (mockApi: MockApi) =>
  mockApi.requests
    .filter((r) => r.method === 'GET' && r.path.startsWith(D1) && !r.path.startsWith(`${D1}/`))
    .map((r) => decodeURIComponent(r.path.slice(D1.length).replaceAll('+', ' ')));

const lastQuery = (mockApi: MockApi) => listQueries(mockApi).at(-1);

const decodedSearch = (page: Page) =>
  decodeURIComponent(new globalThis.URL(page.url()).search.replaceAll('+', ' '));

const table = (page: Page) => page.getByRole('table', { name: 'Blog post entries' });

async function choose(page: Page, combobox: Locator, option: string) {
  await combobox.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function openFilters(page: Page) {
  await page.getByRole('button', { name: /^Filters/ }).click();
  return page.getByRole('region', { name: 'Filters' });
}

test('a text filter goes to the URL and the request, and shows a chip (AC-22)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(URL);
  await expect(table(page).getByRole('row')).toHaveCount(4);

  const panel = await openFilters(page);
  const row = panel.getByRole('group', { name: 'Filter 1' });
  await choose(page, row.getByRole('combobox', { name: 'Field' }), 'Title');
  await choose(page, row.getByRole('combobox', { name: 'Operator' }), 'contains');
  await row.getByRole('textbox', { name: 'Value' }).fill('post 2');
  await panel.getByRole('button', { name: 'Apply' }).click();

  await expect(table(page).getByRole('row')).toHaveCount(2);
  expect(decodedSearch(page)).toBe('?filters[title][$contains]=post 2');
  expect(lastQuery(mockApi)).toBe('?filters[title][$contains]=post 2');
  await expect(page.getByRole('button', { name: 'Title contains “post 2”, remove' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters (1 active)' })).toBeFocused();
});

test('number and boolean filters serialise for their kind; chips and Clear all remove them (AC-22)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(URL);
  await expect(table(page).getByRole('row')).toHaveCount(4);

  let panel = await openFilters(page);
  const first = panel.getByRole('group', { name: 'Filter 1' });
  await choose(page, first.getByRole('combobox', { name: 'Field' }), 'Views');
  await choose(page, first.getByRole('combobox', { name: 'Operator' }), 'is at least');
  await first.getByRole('spinbutton', { name: 'Value' }).fill('20');
  await panel.getByRole('button', { name: 'Add filter' }).click();
  const second = panel.getByRole('group', { name: 'Filter 2' });
  await choose(page, second.getByRole('combobox', { name: 'Field' }), 'Featured');
  await choose(page, second.getByRole('combobox', { name: 'Value' }), 'No');
  await panel.getByRole('button', { name: 'Apply' }).click();

  // Post 3 only: 30 views and not featured.
  await expect(table(page).getByRole('row')).toHaveCount(2);
  await expect(table(page).getByRole('link', { name: 'Post 3' })).toBeVisible();
  expect(decodedSearch(page)).toBe('?filters[featured][$eq]=false&filters[views][$gte]=20');
  expect(lastQuery(mockApi)).toBe('?filters[featured][$eq]=false&filters[views][$gte]=20');

  await page.getByRole('button', { name: 'Featured is No, remove' }).click();
  await expect(table(page).getByRole('row')).toHaveCount(3);
  expect(decodedSearch(page)).toBe('?filters[views][$gte]=20');
  expect(lastQuery(mockApi)).toBe('?filters[views][$gte]=20');
  await expect(
    page.getByRole('list', { name: 'Active filters' }).getByRole('listitem'),
  ).toHaveCount(1);

  panel = await openFilters(page);
  const before = listQueries(mockApi).length;
  await panel.getByRole('button', { name: 'Clear all' }).click();
  await expect(table(page).getByRole('row')).toHaveCount(4);
  await expect(page).toHaveURL(URL);
  // The unfiltered list may come from the cache of the first load; any request it sends is unfiltered.
  expect(
    listQueries(mockApi)
      .slice(before)
      .filter((q) => q !== ''),
  ).toEqual([]);
  await expect(page.getByRole('list', { name: 'Active filters' })).toHaveCount(0);
});

test('a date picked with the keyboard is sent as an ISO value (AC-22)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(`${URL}?filters[createdAt][$gte]=2026-02-02T00:00:00.000Z`);
  await expect(table(page).getByRole('row')).toHaveCount(3);
  await expect(
    page.getByRole('button', { name: 'Created is on or after Feb 2, 2026, remove' }),
  ).toBeVisible();

  const panel = await openFilters(page);
  const value = panel
    .getByRole('group', { name: 'Filter 1' })
    .getByRole('button', { name: 'Value' });
  await expect(value).toHaveText('Feb 2, 2026');
  await value.focus();
  await page.keyboard.press('Enter');
  const calendar = page.getByRole('dialog', { name: 'Choose a date' });
  await expect(calendar).toBeVisible();
  await expect(calendar.locator('[data-day="2026-02-02"] button')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(calendar.locator('[data-day="2026-02-03"] button')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(calendar).toBeHidden();
  await expect(value).toBeFocused();
  await expect(value).toHaveText('Feb 3, 2026');

  // Escape closes the calendar without a change and returns focus.
  await page.keyboard.press('Enter');
  await expect(calendar).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(calendar).toBeHidden();
  await expect(value).toBeFocused();
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(table(page).getByRole('row')).toHaveCount(2);
  expect(lastQuery(mockApi)).toBe('?filters[created_at][$gte]=2026-02-03T00:00:00.000Z');
  expect(decodedSearch(page)).toBe('?filters[createdAt][$gte]=2026-02-03T00:00:00.000Z');
});

test('the panel offers no Status field (AC-22, D7)', async ({ page, mockApi, mockContent }) => {
  seedContent(mockContent);
  signedInAs(mockApi);
  await page.goto(URL);

  const panel = await openFilters(page);
  await panel.getByRole('combobox', { name: 'Field' }).click();

  await expect(page.getByRole('option')).toHaveText([
    'ID',
    'Document ID',
    'Created',
    'Updated',
    'Published',
    'Title',
    'Excerpt',
    'Views',
    'Featured',
  ]);
});

test('a content type manager chooses and reorders columns, and the table follows (AC-25)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi, CONTENT_MANAGER);
  await page.goto(URL);
  await expect(table(page).getByRole('row')).toHaveCount(4);

  const columns = page.getByRole('button', { name: 'Columns' });
  await columns.click();
  const dialog = page.getByRole('dialog', { name: 'Choose columns' });
  await expect(dialog).toContainText('This applies to everyone');
  await dialog.getByRole('checkbox', { name: 'Featured', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Created', exact: true }).check();
  await dialog.getByRole('button', { name: 'Move Views up' }).click();

  const c3 = page.waitForRequest((request) => request.method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Save columns' }).click();
  expect((await c3).postDataJSON()).toEqual({
    listFields: ['views', 'title', 'updatedAt', 'createdAt'],
  });

  await expect(dialog).toBeHidden();
  await expect(columns).toBeFocused();
  await expect(table(page).getByRole('columnheader')).toHaveText([
    'Select all entries on this page',
    'Views',
    'Title',
    'Updated',
    'Created',
    'Status',
    'Actions',
  ]);
  expect(mockApi.requests.filter((r) => r.path === C3)).toEqual([
    expect.objectContaining({ method: 'PATCH', status: 200 }),
  ]);
});

test('saving with no column chosen is blocked and sends nothing (AC-25)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi, CONTENT_MANAGER);
  await page.goto(URL);

  await page.getByRole('button', { name: 'Columns' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose columns' });
  for (const name of ['Title', 'Views', 'Featured', 'Updated']) {
    await dialog.getByRole('checkbox', { name, exact: true }).uncheck();
  }
  await dialog.getByRole('button', { name: 'Save columns' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Choose at least one column.');
  expect(mockApi.requests.filter((r) => r.path === C3)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Columns' })).toBeFocused();
});

test('for an admin, Columns is gated and shows the reason (AC-25)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi, ROLES.admin);
  await page.goto(URL);
  await expect(table(page)).toBeVisible();

  const columns = page.getByRole('button', { name: 'Columns' });
  await expect(columns).toHaveAttribute('aria-disabled', 'true');
  await expect(columns).toHaveAccessibleDescription(
    'Requires the "content_type:manager" permission.',
  );
  await columns.click({ force: true });

  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(mockApi.requests.filter((r) => r.path === C3)).toEqual([]);
});
