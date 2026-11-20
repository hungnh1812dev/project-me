import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { ADMIN_COPY, contentListPath } from '../src/Apps.contract';
import { editUrlPattern, HTTP, PAGE_CV_A_NAME, PAGE_CV_A_SLUG } from '../src/E2e.constants';
import { contentSaveButton, fieldByLabel } from '../src/Locators.fixture';
import { bearer, ownerApiToken, signInAsOwner } from '../src/Session.fixture';

const copy = ADMIN_COPY.content;
const MENU_LABEL = ADMIN_COPY.access.nav.label;
const OTHER_NAME = 'Module Status';
const OTHER_SLUG = 'module-status';

// Text field "Name" and richtext field "Summary" of page-cv-a.
const NAME_V1 = 'qc reopen name v1';
const SUMMARY_V1 = 'qc reopen summary v1';
const NAME_V2 = 'qc reopen name v2';
const SUMMARY_V2 = 'qc reopen summary v2';

const menuLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: MENU_LABEL }).getByRole('link', { name });

const summaryEditor = (page: Page) => page.getByRole('textbox', { name: 'Summary', exact: true });

async function replaceSummary(page: Page, text: string): Promise<void> {
  const editor = summaryEditor(page);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await expect(editor).toHaveText(text);
}

async function expectValues(page: Page, name: string, summary: string): Promise<void> {
  await expect(fieldByLabel(page, 'Name')).toHaveValue(name);
  await expect(summaryEditor(page)).toHaveText(summary);
}

async function removeQcDocuments(request: APIRequestContext, token: string): Promise<void> {
  const response = await request.get(apiUrl(API_PATHS.documents(PAGE_CV_A_SLUG)), {
    headers: bearer(token),
    params: { status: 'draft', pageSize: 100 },
  });
  const rows = (
    (await response.json()) as { data: { documentId: string; values?: { name?: string } }[] }
  ).data;
  for (const row of rows) {
    if (row.values?.name?.startsWith('qc reopen')) {
      await request.delete(apiUrl(API_PATHS.document(PAGE_CV_A_SLUG, row.documentId)), {
        headers: bearer(token),
      });
    }
  }
  // The dev data holds no module-status document, so every one is the spec's own.
  const others = await request.get(apiUrl(API_PATHS.documents(OTHER_SLUG)), {
    headers: bearer(token),
    params: { status: 'draft' },
  });
  for (const row of ((await others.json()) as { data: { documentId: string }[] }).data) {
    await request.delete(apiUrl(API_PATHS.document(OTHER_SLUG, row.documentId)), {
      headers: bearer(token),
    });
  }
}

test.describe(
  'collection document reopened after work on another type (in-app moves only)',
  { tag: ['@cms-admin', '@cms-api', '@content-editing'] },
  () => {
    let token = '';

    test.beforeEach(async ({ request }) => {
      token = await ownerApiToken(request);
      await removeQcDocuments(request, token);
    });

    test.afterEach(async ({ request }) => {
      await removeQcDocuments(request, token);
    });

    test('case b: list row and browser back show the last saved text and richtext values', async ({
      page,
    }) => {
      await signInAsOwner(page);
      await menuLink(page, PAGE_CV_A_NAME).click();
      await expect(page).toHaveURL(new RegExp(`${contentListPath(PAGE_CV_A_SLUG)}$`));

      await page.getByRole('link', { name: copy.collection.newDocument }).first().click();
      await fieldByLabel(page, 'Name').fill(NAME_V1);
      await replaceSummary(page, SUMMARY_V1);
      await contentSaveButton(page).click();
      await expect(page).toHaveURL(editUrlPattern(PAGE_CV_A_SLUG));
      const documentUrl = page.url();
      await expectValues(page, NAME_V1, SUMMARY_V1);

      // The new row shows on the list (first paint is not observable here; STR-1 covers it in a unit test).
      await menuLink(page, PAGE_CV_A_NAME).click();
      const row = page.getByRole('link', { name: NAME_V1 }).first();
      await expect(row).toBeVisible({ timeout: 1_000 });
      await row.click();
      await expect(page).toHaveURL(documentUrl);

      await fieldByLabel(page, 'Name').fill(NAME_V2);
      await replaceSummary(page, SUMMARY_V2);
      await contentSaveButton(page).click();
      await expect(page.getByText(copy.saved).first()).toBeVisible();

      // Work on another type: open its create form and save a document there.
      await menuLink(page, OTHER_NAME).click();
      await expect(page).toHaveURL(new RegExp(`/content/${OTHER_SLUG}(/.*)?$`));
      await fieldByLabel(page, 'Title').fill('qc reopen other type');
      await contentSaveButton(page).click();
      await expect(page).toHaveURL(editUrlPattern(OTHER_SLUG));

      await menuLink(page, PAGE_CV_A_NAME).click();
      await page.getByRole('link', { name: NAME_V2 }).first().click();
      await expect(page).toHaveURL(documentUrl);
      await expectValues(page, NAME_V2, SUMMARY_V2);

      await menuLink(page, PAGE_CV_A_NAME).click();
      await expect(page).toHaveURL(new RegExp(`${contentListPath(PAGE_CV_A_SLUG)}$`));
      await page.goBack();
      await expect(page).toHaveURL(documentUrl);
      await expectValues(page, NAME_V2, SUMMARY_V2);
    });
  },
);
