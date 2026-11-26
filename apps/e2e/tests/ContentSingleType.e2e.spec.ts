import { expect, test, type Page } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { ADMIN_COPY, contentListPath, contentNewPath } from '../src/Apps.contract';
import { editUrlPattern, HTTP, PAGE_CV_A_NAME, PAGE_CV_A_SLUG } from '../src/E2e.constants';
import { contentSaveButton, fieldByLabel } from '../src/Locators.fixture';
import { bearer, ownerApiToken, signInAsOwner } from '../src/Session.fixture';

const copy = ADMIN_COPY.content;
const list = copy.collection;

// The dev data has no single type, so the catalog entry is faked: page-cv-a's
// definition with kind "single" served under its own slug.
const SINGLE_SLUG = 'e2e-single';
const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const LOADING_DELAY_MS = 1_500;
const CONTENT_TYPES_PATH = '/content-types';
// The query client retries a failed request with backoff before showing the error.
const RETRY_BACKOFF_MS = 20_000;

const documentsUrl = new RegExp(`${API_PATHS.documents(SINGLE_SLUG)}(\\?|$)`);

async function fakeSingleType(page: Page, pageCvA: Record<string, unknown>): Promise<void> {
  await page.route(new RegExp(`${CONTENT_TYPES_PATH}/${SINGLE_SLUG}$`), (route) =>
    route.fulfill({
      json: { ...pageCvA, slug: SINGLE_SLUG, kind: 'single' },
    }),
  );
}

test.describe(
  'single type direct URL',
  { tag: ['@cms-admin', '@cms-api', '@content-editing'] },
  () => {
    let pageCvA: Record<string, unknown>;

    test.beforeEach(async ({ page, request }) => {
      const token = await ownerApiToken(request);
      const response = await request.get(apiUrl(`${CONTENT_TYPES_PATH}/${PAGE_CV_A_SLUG}`), {
        headers: bearer(token),
      });
      expect(response.status()).toBe(HTTP.OK);
      pageCvA = (await response.json()) as Record<string, unknown>;
      await signInAsOwner(page);
      await fakeSingleType(page, pageCvA);
    });

    test('without a document it replaces the URL with the create form', async ({ page }) => {
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

    test("with a document it opens that document's edit form", async ({ page }) => {
      await page.route(documentsUrl, (route) =>
        route.fulfill({
          json: {
            data: [{ documentId: DOCUMENT_ID }],
            meta: { page: 1, pageSize: 1, total: 1, pageCount: 1 },
          },
        }),
      );
      await page.goto(`/content/${SINGLE_SLUG}`);
      await expect(page).toHaveURL(new RegExp(`/content/${SINGLE_SLUG}/${DOCUMENT_ID}$`));
    });

    test('a request failure shows the error with a retry', async ({ page }) => {
      await page.route(documentsUrl, (route) =>
        route.fulfill({ status: HTTP.SERVER_ERROR, json: {} }),
      );
      await page.goto(`/content/${SINGLE_SLUG}`);
      await expect(page.getByText(list.loadFailed)).toBeVisible({
        timeout: RETRY_BACKOFF_MS,
      });
      await expect(page.getByRole('button', { name: ADMIN_COPY.common.retry })).toBeVisible();
    });

    test('a forbidden role sees the notice', async ({ page }) => {
      await page.route(documentsUrl, (route) =>
        route.fulfill({ status: HTTP.FORBIDDEN, json: {} }),
      );
      await page.goto(`/content/${SINGLE_SLUG}`);
      await expect(page.getByText(list.forbidden)).toBeVisible();
    });

    test('shows the loading skeleton while the request is pending', async ({ page }) => {
      await page.route(documentsUrl, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, LOADING_DELAY_MS));
        await route.fulfill({ status: HTTP.FORBIDDEN, json: {} });
      });
      await page.goto(`/content/${SINGLE_SLUG}`);
      await expect(page.getByText(list.loading)).toBeAttached();
      await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    });
  },
);

test(
  'a collection list is not redirected',
  { tag: ['@cms-admin', '@cms-api', '@content-editing'] },
  async ({ page }) => {
    await signInAsOwner(page);
    await page.goto(contentListPath(PAGE_CV_A_SLUG));
    await expect(page).toHaveURL(new RegExp(`/content/${PAGE_CV_A_SLUG}$`));
    await expect(page.getByRole('link', { name: list.newDocument }).first()).toBeVisible();
  },
);

// Real single type of the dev data (no document seeded): Not Found Page, a "Title" text field.
const REAL_SINGLE_SLUG = 'module-not-found';
const REAL_SINGLE_NAME = 'Not Found Page';
const SECOND_SINGLE_SLUG = 'module-status';
const SECOND_SINGLE_NAME = 'Module Status';
const MENU_LABEL = ADMIN_COPY.access.nav.label;

test.describe(
  'single type reopened after work on another type (real types, in-app moves only)',
  { tag: ['@cms-admin', '@cms-api', '@content-editing'] },
  () => {
    const SAVED_TITLE = 'qc single saved title';
    let token = '';
    let otherDocumentId = '';

    const menuLink = (page: Page, name: string) =>
      page.getByRole('navigation', { name: MENU_LABEL }).getByRole('link', { name });

    const documentIdsOf = async (
      request: import('@playwright/test').APIRequestContext,
      slug = REAL_SINGLE_SLUG,
    ) => {
      const response = await request.get(apiUrl(API_PATHS.documents(slug)), {
        headers: bearer(token),
        params: { status: 'draft' },
      });
      expect(response.status()).toBe(HTTP.OK);
      return ((await response.json()) as { data: { documentId: string }[] }).data.map(
        (row) => row.documentId,
      );
    };

    const removeSingleDocuments = async (request: import('@playwright/test').APIRequestContext) => {
      for (const slug of [REAL_SINGLE_SLUG, SECOND_SINGLE_SLUG]) {
        for (const id of await documentIdsOf(request, slug)) {
          await request.delete(apiUrl(API_PATHS.document(slug, id)), {
            headers: bearer(token),
          });
        }
      }
    };

    test.beforeEach(async ({ request }) => {
      token = await ownerApiToken(request);
      await removeSingleDocuments(request);
      const created = await request.post(apiUrl(API_PATHS.documents(PAGE_CV_A_SLUG)), {
        headers: bearer(token),
        data: { values: { name: 'qc single-type neighbour', position: 'qc' } },
      });
      expect(created.status()).toBe(HTTP.CREATED);
      otherDocumentId = ((await created.json()) as { documentId: string }).documentId;
    });

    test.afterEach(async ({ request }) => {
      await removeSingleDocuments(request);
      await request.delete(apiUrl(API_PATHS.document(PAGE_CV_A_SLUG, otherDocumentId)), {
        headers: bearer(token),
      });
    });

    test('case a: reopening from the side menu shows the saved document, not a new form', async ({
      page,
      request,
    }) => {
      await signInAsOwner(page);
      await menuLink(page, REAL_SINGLE_NAME).click();
      await expect(page).toHaveURL(new RegExp(`${contentNewPath(REAL_SINGLE_SLUG)}$`));
      await fieldByLabel(page, 'Title').fill(SAVED_TITLE);
      await contentSaveButton(page).click();
      await expect(page).toHaveURL(editUrlPattern(REAL_SINGLE_SLUG));
      await expect(fieldByLabel(page, 'Title')).toHaveValue(SAVED_TITLE);
      const savedUrl = page.url();

      await menuLink(page, PAGE_CV_A_NAME).click();
      await expect(page).toHaveURL(new RegExp(`${contentListPath(PAGE_CV_A_SLUG)}$`));
      await page
        .getByRole('link', { name: /qc single-type neighbour/ })
        .first()
        .click();
      await expect(page).toHaveURL(editUrlPattern(PAGE_CV_A_SLUG));

      await menuLink(page, REAL_SINGLE_NAME).click();
      await expect(page).toHaveURL(savedUrl);
      await expect(fieldByLabel(page, 'Title')).toHaveValue(SAVED_TITLE);
      expect(await documentIdsOf(request)).toHaveLength(1);
    });

    test("case a2: a create form never keeps another type's typed value", async ({ page }) => {
      await signInAsOwner(page);
      await menuLink(page, SECOND_SINGLE_NAME).click();
      await expect(page).toHaveURL(new RegExp(`${contentNewPath('module-status')}$`));
      await menuLink(page, REAL_SINGLE_NAME).click();
      await expect(page).toHaveURL(new RegExp(`${contentNewPath(REAL_SINGLE_SLUG)}$`));
      await fieldByLabel(page, 'Title').fill('typed in the first form');
      await menuLink(page, SECOND_SINGLE_NAME).click();
      await expect(page).toHaveURL(new RegExp(`${contentNewPath('module-status')}$`));
      await expect(fieldByLabel(page, 'Title')).toHaveValue('');
      await expect(fieldByLabel(page, 'Title')).not.toHaveValue('typed in the first form');
    });
  },
);
