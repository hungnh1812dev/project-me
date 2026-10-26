import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import { ADMIN_COPY, MEDIA_ALT_MAX_LENGTH } from '../src/AppContracts.contract';
import { e2eEnv } from '../src/E2e.env';
import { fakeMediaApi, PNG_BASE64 } from '../src/FakeMediaApi.fixture';
import { signInAs } from '../src/Session.fixture';
import { RUN_ID } from '../src/E2e.constants';

const copy = ADMIN_COPY.media;
const access = ADMIN_COPY.access;

const FILE_NAME = `e2e-media-${RUN_ID}.png`;
const TEXT_FILE_NAME = `e2e-media-${RUN_ID}.txt`;
const ALT_TEXT = `E2E alt ${RUN_ID}`;
const ALT_PADDING = 'a';

const row = (page: Page) =>
  page.getByRole('row').filter({ hasText: FILE_NAME });

const upload = (page: Page, name: string, mimeType: string, body: Buffer) =>
  page.getByTestId('media-upload-input').setInputFiles({
    name,
    mimeType,
    buffer: body,
  });

test.describe.serial('owner: media library', () => {
  const inUse = new Set<string>();
  let page: Page;
  let context: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    await fakeMediaApi(context, inUse);
    page = await context.newPage();
    await signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('the nav link opens the library with its heading and upload button', async () => {
    const nav = page.getByRole('navigation', { name: access.nav.label });
    await nav.getByRole('link', { name: access.nav.media }).click();
    await expect(page).toHaveURL(/\/media$/);
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await expect(page.getByRole('button', { name: copy.upload })).toBeVisible();
  });

  test('an unsupported file type is refused with the reason', async () => {
    await upload(page, TEXT_FILE_NAME, 'text/plain', Buffer.from('hello'));
    await expect(page.getByText(copy.errors.unsupportedType)).toBeVisible();
    await expect(page.getByText(TEXT_FILE_NAME)).toHaveCount(0);
  });

  test('an uploaded image shows a notice and appears in the list', async () => {
    await upload(
      page,
      FILE_NAME,
      'image/png',
      Buffer.from(PNG_BASE64, 'base64'),
    );
    await expect(page.getByText(copy.uploaded(FILE_NAME))).toBeVisible();
    await expect(row(page)).toBeVisible();
    await expect(row(page)).toContainText(copy.noAlt);
  });

  test('alt text over the limit is refused inline without a request', async () => {
    let patched = 0;
    const count = (request: { method(): string }) => {
      if (request.method() === 'PATCH') patched += 1;
    };
    page.on('request', count);
    await page
      .getByRole('button', { name: copy.editAltLabel(FILE_NAME) })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByLabel(copy.altDialog.label)
      .fill(ALT_PADDING.repeat(MEDIA_ALT_MAX_LENGTH + 1));
    await dialog.getByRole('button', { name: copy.altDialog.save }).click();
    await expect(dialog).toContainText(
      copy.altDialog.tooLong(MEDIA_ALT_MAX_LENGTH),
    );
    expect(patched).toBe(0);
    page.off('request', count);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('saving alt text shows it in the list; clearing it restores the placeholder', async () => {
    const editButton = page.getByRole('button', {
      name: copy.editAltLabel(FILE_NAME),
    });
    await editButton.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(copy.altDialog.label).fill(ALT_TEXT);
    await dialog.getByRole('button', { name: copy.altDialog.save }).click();
    await expect(page.getByText(copy.altDialog.saved(FILE_NAME))).toBeVisible();
    await expect(row(page)).toContainText(ALT_TEXT);

    await editButton.click();
    await dialog.getByLabel(copy.altDialog.label).fill('');
    await dialog.getByRole('button', { name: copy.altDialog.save }).click();
    await expect(row(page)).toContainText(copy.noAlt);
  });

  test('a file attached to a document keeps the delete dialog open with the in-use message', async () => {
    // The attach contract is not built yet: the stand-in API reports the file as in use.
    inUse.add(FILE_NAME);
    await page
      .getByRole('button', { name: copy.deleteLabel(FILE_NAME) })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(copy.deleteDialog.title(FILE_NAME));
    await dialog
      .getByRole('button', { name: copy.deleteDialog.submit(FILE_NAME) })
      .click();
    await expect(dialog).toContainText(copy.errors.inUse);
    await expect(dialog).toBeVisible();
    inUse.delete(FILE_NAME);
    await dialog
      .getByRole('button', { name: copy.deleteDialog.cancel })
      .click();
    await expect(dialog).toBeHidden();
    // The page behind an open dialog is aria-hidden, so check the row after.
    await expect(row(page)).toBeVisible();
  });

  test('deleting an unused file removes its row', async () => {
    await page
      .getByRole('button', { name: copy.deleteLabel(FILE_NAME) })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('button', { name: copy.deleteDialog.submit(FILE_NAME) })
      .click();
    await expect(
      page.getByText(copy.deleteDialog.deleted(FILE_NAME)),
    ).toBeVisible();
    await expect(row(page)).toHaveCount(0);
  });
});
