import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import {
  ADMIN_COPY,
  API_ERROR_CODES,
  contentEditPath,
  contentListPath,
  contentNewPath,
} from '../src/Apps.contract';
import { CV_PAGE_SLUG, HTTP, RUN_ID } from '../src/E2e.constants';
import {
  bearer,
  ownerApiToken,
  signInAsOwner,
  signInAsOwnerWithRole,
} from '../src/Session.fixture';

const copy = ADMIN_COPY.content;
const actions = copy.actions;
const states = copy.publishState;
const bulk = copy.bulk;

const NAME_FIELD = 'position';
const NAME_LABEL = /^Position/;
const FIRST = `Lifecycle ${RUN_ID}`;
const EDITED = `${FIRST} edited`;
const SECOND = `Lifecycle second ${RUN_ID}`;
const BULK_NAME = `Lifecycle bulk ${RUN_ID}`;
const MOBILE_WIDTH = 375;
const MOBILE_HEIGHT = 800;
const SCROLL_TOLERANCE_PX = 1;

const NO_PUBLISH_ROLE = { slug: `qc-nopub-${RUN_ID}`, name: `QC no publish ${RUN_ID}`, rank: 20 };
const FIELD_LIMITED_ROLE = {
  slug: `qc-fieldlim-${RUN_ID}`,
  name: `QC field limited ${RUN_ID}`,
  rank: 21,
};
const READ_ROW = { subject: CV_PAGE_SLUG, action: 'read' };
const UPDATE_ROW = { subject: CV_PAGE_SLUG, action: 'update' };
const LIMITED_UPDATE_ROW = { ...UPDATE_ROW, writableFields: [NAME_FIELD] };

const ROLE_ROWS = {
  [NO_PUBLISH_ROLE.slug]: [READ_ROW, UPDATE_ROW],
  [FIELD_LIMITED_ROLE.slug]: [
    READ_ROW,
    LIMITED_UPDATE_ROW,
    { subject: CV_PAGE_SLUG, action: 'publish' },
    { subject: CV_PAGE_SLUG, action: 'unpublish' },
  ],
};

const button = (page: Page, name: string): Locator =>
  page.getByRole('button', { name, exact: true });
const badge = (page: Page, text: string): Locator =>
  page.getByRole('main').getByText(text, { exact: true }).first();
const listRow = (page: Page, name: string): Locator =>
  page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });

async function writeApi(
  request: APIRequestContext,
  token: string,
  path: string,
  data: unknown,
  method: 'post' | 'put' = 'post',
) {
  return request[method](apiUrl(path), { headers: bearer(token), data });
}

async function createDraft(request: APIRequestContext, token: string, position: string) {
  const response = await writeApi(request, token, API_PATHS.documents(CV_PAGE_SLUG), {
    values: { [NAME_FIELD]: position },
  });
  expect(response.status()).toBe(HTTP.CREATED);
  return (await response.json()) as { documentId: string; version: number };
}

async function openEdit(page: Page, documentId: string) {
  await page.goto(contentEditPath(CV_PAGE_SLUG, documentId));
  await expect(page.getByLabel(NAME_LABEL)).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(SCROLL_TOLERANCE_PX);
}

test.describe.serial('document lifecycle: badge, actions and Status column', () => {
  let page: Page;
  let token: string;
  let documentId: string;
  const consoleProblems: string[] = [];
  const roleIds: string[] = [];

  test.beforeAll(async ({ browser, request }) => {
    token = await ownerApiToken(request);
    for (const role of [NO_PUBLISH_ROLE, FIELD_LIMITED_ROLE]) {
      const created = await writeApi(request, token, API_PATHS.ROLES, role);
      expect(created.status()).toBe(HTTP.CREATED);
      const { id } = (await created.json()) as { id: string };
      roleIds.push(id);
      const rows = await writeApi(
        request,
        token,
        `${API_PATHS.ROLES}/${id}/permissions`,
        { permissions: ROLE_ROWS[role.slug] },
        'put',
      );
      expect(rows.status()).toBe(HTTP.OK);
    }
    page = await (await browser.newContext()).newPage();
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
        consoleProblems.push(message.text());
      }
    });
    page.on('pageerror', (error) => consoleProblems.push(error.message));
    await signInAsOwner(page);
  });

  test.afterAll(async ({ request }) => {
    await page.context().close();
    for (const id of roleIds) {
      await request.delete(apiUrl(`${API_PATHS.ROLES}/${id}`), { headers: bearer(token) });
    }
  });

  test('a new unsaved document shows Save only and no badge; saving gives Draft', async () => {
    await page.goto(contentNewPath(CV_PAGE_SLUG));
    await expect(page.getByLabel(NAME_LABEL)).toBeVisible();
    await expect(button(page, actions.publish)).toHaveCount(0);
    await expect(button(page, actions.unpublish)).toHaveCount(0);
    await expect(button(page, actions.discard)).toHaveCount(0);
    for (const text of Object.values(states)) await expect(badge(page, text)).toHaveCount(0);

    await page.getByLabel(NAME_LABEL).fill(FIRST);
    await button(page, copy.save).click();
    await expect(page).toHaveURL(/\/cv-page\/(?!new$)[^/]+$/);
    documentId = page.url().split('/').pop() as string;
    await expect(badge(page, states.draft)).toBeVisible();
  });

  test('Draft: Publish needs a clean form; Unpublish and Discard are disabled', async () => {
    await expect(button(page, copy.save)).toBeDisabled();
    await expect(button(page, actions.publish)).toBeEnabled();
    await expect(button(page, actions.unpublish)).toBeDisabled();
    await expect(button(page, actions.discard)).toBeDisabled();

    await page.getByLabel(NAME_LABEL).fill(`${FIRST} typing`);
    await expect(button(page, copy.save)).toBeEnabled();
    await expect(button(page, actions.publish)).toBeDisabled();
    await page.getByLabel(NAME_LABEL).fill(FIRST);
    await expect(button(page, actions.publish)).toBeEnabled();
  });

  test('Status column shows Draft, with no sort control and no filter', async () => {
    await page.goto(contentListPath(CV_PAGE_SLUG));
    const header = page.getByRole('columnheader', { name: copy.collection.columns.status });
    await expect(header).toBeVisible();
    await expect(header.getByRole('button')).toHaveCount(0);
    await expect(listRow(page, FIRST)).toContainText(states.draft);
  });

  test('Publish: Published badge, notice, public read has the values', async ({ request }) => {
    await openEdit(page, documentId);
    await button(page, actions.publish).click();
    await expect(page.getByText(actions.published)).toBeVisible();
    await expect(badge(page, states.published)).toBeVisible();
    await expect(button(page, actions.publish)).toBeDisabled();
    await expect(button(page, actions.unpublish)).toBeEnabled();
    await expect(button(page, actions.discard)).toBeDisabled();

    const publicRead = await request.get(apiUrl(API_PATHS.document(CV_PAGE_SLUG, documentId)));
    expect(publicRead.status()).toBe(HTTP.OK);
    const body = (await publicRead.json()) as {
      values: Record<string, string>;
      publishState?: string;
    };
    expect(body.values[NAME_FIELD]).toBe(FIRST);
    expect(body.publishState).toBeUndefined();
  });

  test('Save an edit: Modified badge, Discard and Publish enabled, public read unchanged', async ({
    request,
  }) => {
    await page.getByLabel(NAME_LABEL).fill(EDITED);
    await button(page, copy.save).click();
    await expect(page.getByText(copy.saved)).toBeVisible();
    await expect(badge(page, states.modified)).toBeVisible();
    await expect(button(page, actions.discard)).toBeEnabled();
    await expect(button(page, actions.publish)).toBeEnabled();

    const publicRead = await request.get(apiUrl(API_PATHS.document(CV_PAGE_SLUG, documentId)));
    const body = (await publicRead.json()) as { values: Record<string, string> };
    expect(body.values[NAME_FIELD]).toBe(FIRST);

    await page.goto(contentListPath(CV_PAGE_SLUG));
    await expect(listRow(page, EDITED)).toContainText(states.modified);
  });

  test('Discard dialog: Cancel is focused first, names the lost changes and returns focus', async () => {
    await openEdit(page, documentId);
    const trigger = button(page, actions.discard);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: actions.discardDialog.title });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(actions.discardDialog.description);
    await expect(dialog.getByRole('button', { name: actions.discardDialog.cancel })).toBeFocused();
    await expect(dialog).not.toContainText(actions.discardDialog.unsavedEdits);
    await dialog.getByRole('button', { name: actions.discardDialog.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(badge(page, states.modified)).toBeVisible();
    await expect(page.getByLabel(NAME_LABEL)).toHaveValue(EDITED);

    // With a dirty form the dialog also names the unsaved edits.
    await page.getByLabel(NAME_LABEL).fill(`${EDITED} unsaved`);
    await trigger.click();
    await expect(dialog).toContainText(actions.discardDialog.unsavedEdits);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByLabel(NAME_LABEL).fill(EDITED);
  });

  test('Discard: draft goes back to the published values, badge Published', async () => {
    await openEdit(page, documentId);
    await button(page, actions.discard).click();
    const dialog = page.getByRole('dialog', { name: actions.discardDialog.title });
    await dialog.getByRole('button', { name: actions.discardDialog.confirm }).click();
    await expect(page.getByText(actions.discarded)).toBeVisible();
    await expect(badge(page, states.published)).toBeVisible();
    await expect(page.getByLabel(NAME_LABEL)).toHaveValue(FIRST);
    await expect(button(page, actions.discard)).toBeDisabled();

    await page.goto(contentListPath(CV_PAGE_SLUG));
    await expect(listRow(page, FIRST)).toContainText(states.published);
  });

  test('Discard on a document that is not modified answers 409 DOCUMENT_NOT_MODIFIED', async ({
    request,
  }) => {
    const current = await request.get(
      `${apiUrl(API_PATHS.document(CV_PAGE_SLUG, documentId))}?status=draft`,
      { headers: bearer(token) },
    );
    const { version, publishState } = (await current.json()) as {
      version: number;
      publishState: string;
    };
    expect(publishState).toBe('published');
    const discard = await writeApi(
      request,
      token,
      API_PATHS.documentDiscard(CV_PAGE_SLUG, documentId),
      { expectedVersion: version },
    );
    expect(discard.status()).toBe(HTTP.CONFLICT);
    expect(((await discard.json()) as { errorCode: string }).errorCode).toBe(
      API_ERROR_CODES.DOCUMENT_NOT_MODIFIED,
    );
  });

  test('Unpublish: Cancel keeps it published; confirm gives Draft and removes the public read', async ({
    request,
  }) => {
    await openEdit(page, documentId);
    const trigger = button(page, actions.unpublish);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: actions.unpublishDialog.title });
    await expect(
      dialog.getByRole('button', { name: actions.unpublishDialog.cancel }),
    ).toBeFocused();
    await dialog.getByRole('button', { name: actions.unpublishDialog.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(badge(page, states.published)).toBeVisible();

    await trigger.click();
    await dialog.getByRole('button', { name: actions.unpublishDialog.confirm }).click();
    await expect(page.getByText(actions.unpublished)).toBeVisible();
    await expect(badge(page, states.draft)).toBeVisible();
    await expect(button(page, actions.publish)).toBeEnabled();

    const publicRead = await request.get(apiUrl(API_PATHS.document(CV_PAGE_SLUG, documentId)));
    expect(publicRead.status()).toBe(HTTP.NOT_FOUND);

    await page.goto(contentListPath(CV_PAGE_SLUG));
    await expect(listRow(page, FIRST)).toContainText(states.draft);
  });

  test('a stale tab shows the conflict notice with Reload', async ({ request }) => {
    const draft = await createDraft(request, token, SECOND);
    await openEdit(page, draft.documentId);
    const other = await page.context().newPage();
    await openEdit(other, draft.documentId);
    await other.getByLabel(NAME_LABEL).fill(`${SECOND} saved elsewhere`);
    await button(other, copy.save).click();
    await expect(other.getByText(copy.saved)).toBeVisible();
    await other.close();

    await button(page, actions.publish).click();
    await expect(page.getByText(copy.errors.conflict)).toBeVisible();
    await expect(page.getByRole('button', { name: copy.errors.reload })).toBeVisible();
    await page.getByRole('button', { name: copy.errors.reload }).click();
    await expect(page.getByLabel(NAME_LABEL)).toHaveValue(`${SECOND} saved elsewhere`);
  });

  test('bulk publish and unpublish update the Status column', async ({ request }) => {
    await createDraft(request, token, BULK_NAME);
    await page.goto(contentListPath(CV_PAGE_SLUG));
    await expect(listRow(page, BULK_NAME)).toContainText(states.draft);

    await page.getByRole('checkbox', { name: copy.collection.selectRow(BULK_NAME) }).check();
    await page.getByRole('button', { name: bulk.publish(1), exact: true }).click();
    await expect(listRow(page, BULK_NAME)).toContainText(states.published);

    await page.getByRole('checkbox', { name: copy.collection.selectRow(BULK_NAME) }).check();
    await page.getByRole('button', { name: bulk.unpublish(1), exact: true }).click();
    await expect(listRow(page, BULK_NAME)).toContainText(states.draft);
  });

  test('at 375 px the edit page and the list have no new horizontal overflow', async () => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
    await openEdit(page, documentId);
    await expectNoHorizontalOverflow(page);
    await expect(button(page, actions.publish)).toBeVisible();
    await page.goto(contentListPath(CV_PAGE_SLUG));
    await expect(
      page.getByRole('columnheader', { name: copy.collection.columns.status }),
    ).toBeAttached();
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('the whole walk logged no console error', () => {
    expect(consoleProblems).toEqual([]);
  });

  test('a role with update but no publish sees no Publish or Unpublish', async ({
    browser,
    request,
  }) => {
    const draft = await createDraft(request, token, `${FIRST} nopub`);
    await writeApi(request, token, API_PATHS.documentPublish(CV_PAGE_SLUG, draft.documentId), {
      expectedVersion: draft.version,
    });
    const roleContext = await browser.newContext();
    const rolePage = await roleContext.newPage();
    await signInAsOwnerWithRole(rolePage, NO_PUBLISH_ROLE.slug);
    await openEdit(rolePage, draft.documentId);
    await expect(badge(rolePage, states.published)).toBeVisible();
    await expect(button(rolePage, actions.publish)).toHaveCount(0);
    await expect(button(rolePage, actions.unpublish)).toHaveCount(0);
    await expect(button(rolePage, copy.save)).toBeVisible();
    await roleContext.close();
  });

  test('a field-limited update role sees no Discard, and the API refuses its discard', async ({
    browser,
    request,
  }) => {
    const draft = await createDraft(request, token, `${FIRST} limited`);
    const publish = await writeApi(
      request,
      token,
      API_PATHS.documentPublish(CV_PAGE_SLUG, draft.documentId),
      { expectedVersion: draft.version },
    );
    expect(publish.status()).toBe(HTTP.OK);
    const roleContext = await browser.newContext();
    const rolePage = await roleContext.newPage();
    await signInAsOwnerWithRole(rolePage, FIELD_LIMITED_ROLE.slug);
    await openEdit(rolePage, draft.documentId);
    await expect(button(rolePage, actions.unpublish)).toBeVisible();
    await expect(button(rolePage, actions.discard)).toHaveCount(0);
    await roleContext.close();

    const scoped = await writeApi(request, token, API_PATHS.API_TOKENS, {
      name: `qc-lifecycle-limited-${RUN_ID}`,
      scope: { permissions: [READ_ROW, LIMITED_UPDATE_ROW] },
    });
    expect(scoped.status()).toBe(HTTP.CREATED);
    const created = (await scoped.json()) as { id: string; token: string };
    const discard = await writeApi(
      request,
      created.token,
      API_PATHS.documentDiscard(CV_PAGE_SLUG, draft.documentId),
      { expectedVersion: draft.version },
    );
    expect(discard.status()).toBe(HTTP.FORBIDDEN);
    await request.post(apiUrl(`${API_PATHS.API_TOKENS}/${created.id}/revoke`), {
      headers: bearer(token),
    });
  });

  test('a reviewer-like read-only role sees no lifecycle action', async ({ browser, request }) => {
    const draft = await createDraft(request, token, `${FIRST} readonly`);
    const roleContext = await browser.newContext();
    const rolePage = await roleContext.newPage();
    await signInAsOwnerWithRole(rolePage, 'guest');
    await openEdit(rolePage, draft.documentId);
    for (const name of [actions.publish, actions.unpublish, actions.discard]) {
      await expect(button(rolePage, name)).toHaveCount(0);
    }
    await roleContext.close();
  });

  test('the owner sees all four actions on a Modified document', async ({ request }) => {
    const draft = await createDraft(request, token, `${FIRST} all four`);
    await writeApi(request, token, API_PATHS.documentPublish(CV_PAGE_SLUG, draft.documentId), {
      expectedVersion: draft.version,
    });
    await openEdit(page, draft.documentId);
    await page.getByLabel(NAME_LABEL).fill(`${FIRST} all four edited`);
    await button(page, copy.save).click();
    await expect(badge(page, states.modified)).toBeVisible();
    for (const name of [copy.save, actions.publish, actions.unpublish, actions.discard]) {
      await expect(button(page, name)).toBeVisible();
    }
  });

  test('focus returns to the trigger after a confirm dialog closes (Cancel and Escape)', async ({
    request,
  }) => {
    const draft = await createDraft(request, token, `${FIRST} focus`);
    await writeApi(request, token, API_PATHS.documentPublish(CV_PAGE_SLUG, draft.documentId), {
      expectedVersion: draft.version,
    });
    await openEdit(page, draft.documentId);
    const trigger = button(page, actions.unpublish);
    const dialog = page.getByRole('dialog', { name: actions.unpublishDialog.title });
    await trigger.click();
    await dialog.getByRole('button', { name: actions.unpublishDialog.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
