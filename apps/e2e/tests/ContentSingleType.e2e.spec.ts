import { expect, type Page, test } from '@playwright/test';

import {
  ADMIN_COPY,
  contentListPath,
  contentNewPath,
} from '../src/AppContracts.contract';
import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { HTTP, CV_PAGE_SLUG } from '../src/E2e.constants';
import { bearer, ownerApiToken, signInAsOwner } from '../src/Session.fixture';

const copy = ADMIN_COPY.content;
const list = copy.collection;

// The dev data has no single type, so the catalog entry is faked: cv-page's
// definition with kind "single" served under its own slug.
const SINGLE_SLUG = 'e2e-single';
const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const LOADING_DELAY_MS = 1_500;
const CONTENT_TYPES_PATH = '/content-types';
// The query client retries a failed request with backoff before showing the error.
const RETRY_BACKOFF_MS = 20_000;

const documentsUrl = new RegExp(`${API_PATHS.documents(SINGLE_SLUG)}(\\?|$)`);

async function fakeSingleType(
  page: Page,
  cvPage: Record<string, unknown>,
): Promise<void> {
  await page.route(
    new RegExp(`${CONTENT_TYPES_PATH}/${SINGLE_SLUG}$`),
    (route) =>
      route.fulfill({
        json: { ...cvPage, slug: SINGLE_SLUG, kind: 'single' },
      }),
  );
}

test.describe('single type direct URL', () => {
  let cvPage: Record<string, unknown>;

  test.beforeEach(async ({ page, request }) => {
    const token = await ownerApiToken(request);
    const response = await request.get(
      apiUrl(`${CONTENT_TYPES_PATH}/${CV_PAGE_SLUG}`),
      { headers: bearer(token) },
    );
    expect(response.status()).toBe(HTTP.OK);
    cvPage = (await response.json()) as Record<string, unknown>;
    await signInAsOwner(page);
    await fakeSingleType(page, cvPage);
  });

  test('without a document it replaces the URL with the create form', async ({
    page,
  }) => {
    await page.route(documentsUrl, (route) =>
      route.fulfill({
        json: {
          data: [],
          meta: { page: 1, pageSize: 1, total: 0, pageCount: 0 },
        },
      }),
    );
    await page.goto(`/content/${SINGLE_SLUG}`);
    await expect(page).toHaveURL(new RegExp(`${contentNewPath(SINGLE_SLUG)}$`));
    await page.goBack();
    await expect(page).not.toHaveURL(new RegExp(`/content/${SINGLE_SLUG}$`));
  });

  test("with a document it opens that document's edit form", async ({
    page,
  }) => {
    await page.route(documentsUrl, (route) =>
      route.fulfill({
        json: {
          data: [{ documentId: DOCUMENT_ID }],
          meta: { page: 1, pageSize: 1, total: 1, pageCount: 1 },
        },
      }),
    );
    await page.goto(`/content/${SINGLE_SLUG}`);
    await expect(page).toHaveURL(
      new RegExp(`/content/${SINGLE_SLUG}/${DOCUMENT_ID}$`),
    );
  });

  test('a request failure shows the error with a retry', async ({ page }) => {
    await page.route(documentsUrl, (route) =>
      route.fulfill({ status: HTTP.SERVER_ERROR, json: {} }),
    );
    await page.goto(`/content/${SINGLE_SLUG}`);
    await expect(page.getByText(list.loadFailed)).toBeVisible({
      timeout: RETRY_BACKOFF_MS,
    });
    await expect(
      page.getByRole('button', { name: ADMIN_COPY.common.retry }),
    ).toBeVisible();
  });

  test('a forbidden role sees the notice', async ({ page }) => {
    await page.route(documentsUrl, (route) =>
      route.fulfill({ status: HTTP.FORBIDDEN, json: {} }),
    );
    await page.goto(`/content/${SINGLE_SLUG}`);
    await expect(page.getByText(list.forbidden)).toBeVisible();
  });

  test('shows the loading skeleton while the request is pending', async ({
    page,
  }) => {
    await page.route(documentsUrl, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, LOADING_DELAY_MS));
      await route.fulfill({ status: HTTP.FORBIDDEN, json: {} });
    });
    await page.goto(`/content/${SINGLE_SLUG}`);
    await expect(page.getByText(list.loading)).toBeAttached();
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  });
});

test('a collection list is not redirected', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(contentListPath(CV_PAGE_SLUG));
  await expect(page).toHaveURL(new RegExp(`/content/${CV_PAGE_SLUG}$`));
  await expect(
    page.getByRole('link', { name: list.newDocument }).first(),
  ).toBeVisible();
});
