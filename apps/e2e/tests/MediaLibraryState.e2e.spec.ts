import { expect, test, type Page, type Response } from '@playwright/test';

import { ADMIN_COPY, MEDIA_DEFAULT_PAGE_SIZE } from '../src/Apps.contract';
import { RUN_ID } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { signInAs } from '../src/Session.fixture';
import { insertLibraryFiles } from '../src/SmokeDatabase.client';

const copy = ADMIN_COPY.media;

const PREFIX = `e2e-lib-${RUN_ID}`;
const FILE_COUNT = MEDIA_DEFAULT_PAGE_SIZE + 3;
const NAMES = Array.from(
  { length: FILE_COUNT },
  (_, index) => `${PREFIX}-${String(index).padStart(2, '0')}.png`,
);
const SEARCH_DEBOUNCE_SETTLE_MS = 1_000;
const BAD_QUERY = '?page=-1&pageSize=7&mimeType=text/html';
const NO_MATCH = `${PREFIX}-nothing-matches`;

const cards = (page: Page) =>
  page.getByRole('list', { name: copy.grid.label }).getByRole('listitem');
const searchBox = (page: Page) => page.getByLabel(copy.filters.search);
const isMediaList = (response: Response) =>
  response.request().method() === 'GET' && /\/media\?/.test(response.url());

test.describe.serial('owner: file library with the real API', () => {
  test.beforeAll(() => {
    insertLibraryFiles(NAMES);
  });

  test.beforeEach(async ({ page }) => {
    await signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  });

  test('an invalid URL query falls back to the defaults without an API 400', async ({ page }) => {
    const statuses: number[] = [];
    page.on('response', (response) => {
      if (isMediaList(response)) statuses.push(response.status());
    });
    await page.goto(`/media${BAD_QUERY}`);
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((status) => status === 200)).toBe(true);
    await expect(cards(page)).toHaveCount(MEDIA_DEFAULT_PAGE_SIZE);
  });

  test('search filters the grid, is kept in the URL and survives a reload', async ({ page }) => {
    await page.goto('/media');
    await searchBox(page).fill(PREFIX);
    await expect(page).toHaveURL(new RegExp(`search=${PREFIX}`));
    await expect(cards(page)).toHaveCount(MEDIA_DEFAULT_PAGE_SIZE);
    await expect(cards(page).first()).toContainText(PREFIX);

    await page.reload();
    await expect(searchBox(page)).toHaveValue(PREFIX);
    await expect(cards(page)).toHaveCount(MEDIA_DEFAULT_PAGE_SIZE);
  });

  test('the second page shows the rest, back keeps the page', async ({ page }) => {
    await page.goto(`/media?search=${PREFIX}`);
    await expect(cards(page)).toHaveCount(MEDIA_DEFAULT_PAGE_SIZE);
    await page.getByRole('button', { name: /next/i }).first().click();
    await expect(page).toHaveURL(/page=2/);
    await expect(cards(page)).toHaveCount(FILE_COUNT - MEDIA_DEFAULT_PAGE_SIZE);
    await page.goBack();
    await expect(page).not.toHaveURL(/page=2/);
    await expect(cards(page)).toHaveCount(MEDIA_DEFAULT_PAGE_SIZE);
  });

  test('a search without matches shows the no-results state', async ({ page }) => {
    await page.goto('/media');
    await searchBox(page).fill(NO_MATCH);
    await page.waitForTimeout(SEARCH_DEBOUNCE_SETTLE_MS);
    await expect(page.getByText(copy.grid.noResults)).toBeVisible();
    await expect(page.getByText(copy.grid.noResultsHint)).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
  });

  test('a file card links to the original in a new tab with a safe rel', async ({ page }) => {
    await page.goto(`/media?search=${PREFIX}`);
    const link = cards(page)
      .first()
      .getByRole('link', { name: /^View original of / });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('rel', /noreferrer/);
  });
});
