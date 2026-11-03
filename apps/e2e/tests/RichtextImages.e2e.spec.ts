import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { ADMIN_COPY, contentEditPath } from '../src/Apps.contract';
import { CV_PAGE_SLUG, HTTP, RUN_ID } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { pngOf } from '../src/Png.fixture';
import {
  createCvPage,
  removeCvPage,
  uploadImage,
  watchAccessToken,
  type DraftRef,
  type UploadedImage,
} from '../src/RichtextDocument.fixture';
import { bearer, signInAsOwner } from '../src/Session.fixture';

const richtext = ADMIN_COPY.content.richtext;
const media = ADMIN_COPY.media;
const insertCopy = media.imageInsert;
const uploadCopy = media.uploadDialog;

const FIELD_LABEL = 'Summary';
const FOREIGN_SRC = 'https://evil.example/pixel.png';
const UPLOAD_SETTLE_MS = 20_000;
const PNG_SEED_RANGE = 200;
const SEED = (Number.parseInt(RUN_ID, 36) % PNG_SEED_RANGE) + 1;
const UPLOADED_NAME = `e2e-rt-up-${RUN_ID}.png`;
const PICKED_NAME = `e2e-rt-pick-${RUN_ID}.png`;
const PICKED_STEM = `e2e-rt-pick-${RUN_ID}`;
const WEB_NAME = `e2e-rt-web-${RUN_ID}.png`;
const RESUME_NAME = `E2E richtext web ${RUN_ID}`;

const isLoaded = (image: Locator) =>
  image.evaluate((element) => (element as HTMLImageElement).naturalWidth > 0);

/** The library has no read-one route; the list filtered by the name stem holds the file, also after a replace changed its hash. */
async function mediaUrlOf(
  request: APIRequestContext,
  token: string,
  file: UploadedImage,
): Promise<string> {
  const response = await request.get(apiUrl(API_PATHS.MEDIA), {
    headers: bearer(token),
    params: { search: file.fileName.replace(/_[0-9a-f]{8}\.png$/, '') },
  });
  expect(response.status()).toBe(HTTP.OK);
  const { data } = (await response.json()) as { data: UploadedImage[] };
  const found = data.find((item) => item.id === file.id);
  expect(found).toBeDefined();
  return found?.url ?? '';
}

/** Handed from the editor walk to the web check, so the file signs in once. */
let ownerToken = '';

test.describe.serial('owner: images in the richtext editor', () => {
  let page: Page;
  let api: APIRequestContext;
  let draft: DraftRef;
  let token: () => string;
  let picked: UploadedImage;
  let editor: Locator;
  let toolbar: Locator;
  const consoleProblems: string[] = [];

  // Tiptap adds an image of its own (ProseMirror-separator) after an inline image.
  const images = () => editor.locator('img[data-media-id]');
  const dialog = () => page.getByRole('dialog');

  const openInsertDialog = async () => {
    await toolbar.getByRole('button', { name: richtext.insertImage, exact: true }).click();
    await expect(dialog().getByRole('heading', { name: insertCopy.title })).toBeVisible();
  };

  const saveAndReload = async () => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'PUT' && r.url().includes(draft.documentId),
      ),
      page.getByRole('button', { name: ADMIN_COPY.content.save, exact: true }).click(),
    ]);
    expect(response.ok()).toBe(true);
    await page.reload();
    await expect(editor).toBeVisible();
  };

  test.beforeAll(async ({ browser, playwright }) => {
    page = await (await browser.newContext()).newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleProblems.push(message.text());
    });
    page.on('pageerror', (error) => consoleProblems.push(error.message));
    token = watchAccessToken(page);
    await signInAsOwner(page);
    api = await playwright.request.newContext();
    draft = await createCvPage(api, token(), `Richtext images ${RUN_ID}`);
    picked = await uploadImage(api, token(), PICKED_NAME, pngOf(SEED + 1));
    await page.goto(contentEditPath(CV_PAGE_SLUG, draft.documentId));
    editor = page.getByRole('textbox', { name: FIELD_LABEL, exact: true });
    toolbar = page.getByRole('toolbar', { name: richtext.toolbar }).first();
    await expect(editor).toBeVisible();
  });

  test.afterAll(async () => {
    ownerToken = token();
    await removeCvPage(api, token(), draft.documentId);
    await api.dispose();
    await page.context().close();
  });

  test('the dialog offers upload and library, and cancel inserts nothing', async () => {
    await openInsertDialog();
    await expect(dialog().getByRole('button', { name: insertCopy.upload })).toBeVisible();
    await expect(dialog().getByRole('button', { name: insertCopy.library })).toBeVisible();
    await dialog().getByRole('button', { name: insertCopy.cancel }).click();
    await expect(dialog()).toBeHidden();
    await expect(images()).toHaveCount(0);
  });

  test('uploading in the dialog inserts the image at the cursor', async () => {
    await editor.click();
    await page.keyboard.type('Before ');
    await openInsertDialog();
    await dialog().getByRole('button', { name: insertCopy.upload }).click();
    await dialog()
      .getByTestId('upload-dialog-input')
      .setInputFiles({
        name: UPLOADED_NAME,
        mimeType: 'image/png',
        buffer: pngOf(SEED),
      });
    await dialog()
      .getByRole('button', { name: /^Upload/ })
      .click();
    // The dialog stays open on "Uploaded" and hides the editor from the accessibility tree.
    await expect(dialog().getByText(uploadCopy.status.done)).toBeVisible({
      timeout: UPLOAD_SETTLE_MS,
    });
    await dialog().getByRole('button', { name: uploadCopy.close }).click();
    await expect(dialog()).toBeHidden();
    await expect(images()).toHaveCount(1);
    await expect(images().first()).toHaveAttribute('src', new RegExp(`^${e2eEnv.webUrl}/`));
  });

  test('picking from the library inserts a second image', async () => {
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await openInsertDialog();
    await dialog().getByRole('button', { name: insertCopy.library }).click();
    await dialog()
      .getByRole('button', { name: media.picker.select(picked.fileName) })
      .click();
    await expect(dialog()).toBeHidden();
    await expect(images()).toHaveCount(2);
    await expect(images().nth(1)).toHaveAttribute('src', picked.url);
  });

  test('saving and reloading shows both images', async () => {
    await saveAndReload();
    await expect(images()).toHaveCount(2);
    for (const index of [0, 1]) {
      await expect.poll(() => isLoaded(images().nth(index))).toBe(true);
    }
    await expect(editor).toContainText('Before');
  });

  test('deleting a file used in the document answers the in-use message', async () => {
    await page.goto('/media');
    await page.getByRole('button', { name: media.deleteLabel(picked.fileName) }).click();
    await dialog()
      .getByRole('button', { name: media.deleteDialog.submit(picked.fileName) })
      .click();
    await expect(dialog()).toContainText(media.errors.inUse);
    await dialog().getByRole('button', { name: media.deleteDialog.cancel }).click();
    await expect(dialog()).toBeHidden();
  });

  test('replacing the file shows the new file in the document after reload', async () => {
    const before = await mediaUrlOf(api, token(), picked);
    const replacedNotice = new RegExp(`^${PICKED_STEM}_[0-9a-f]{8}\\.png replaced\\.$`);
    await page.goto('/media');
    await page.getByRole('searchbox', { name: media.filters.search }).fill(picked.fileName);
    const card = page.getByRole('listitem').filter({ hasText: picked.fileName });
    await card.getByRole('button', { name: media.grid.replaceLabel(picked.fileName) }).click();
    await dialog()
      .getByTestId('upload-dialog-input')
      .setInputFiles({
        name: PICKED_NAME,
        mimeType: 'image/png',
        buffer: pngOf(SEED + 2),
      });
    await dialog()
      .getByRole('button', { name: /^Upload/ })
      .click();
    await expect(page.getByText(replacedNotice)).toBeVisible({
      timeout: UPLOAD_SETTLE_MS,
    });
    const after = await mediaUrlOf(api, token(), picked);
    expect(after).not.toBe(before);

    await page.goto(contentEditPath(CV_PAGE_SLUG, draft.documentId));
    const replaced = editor.locator(`img[src="${after}"]`);
    await expect(replaced).toHaveCount(1);
    await expect(editor.locator(`img[src="${before}"]`)).toHaveCount(0);
    await expect.poll(() => isLoaded(replaced)).toBe(true);
  });

  test('the console stayed free of unexpected errors', () => {
    // The sign-in page's first session probe answers 401 and logs "Failed to load resource".
    const unexpected = consoleProblems.filter((text) => !text.includes('Failed to load resource'));
    expect(unexpected).toEqual([]);
  });
});

test.describe.serial('web CV: richtext images', () => {
  let api: APIRequestContext;
  let resumeId = '';
  let image: UploadedImage;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext();
    expect(ownerToken).not.toBe('');
    image = await uploadImage(api, ownerToken, WEB_NAME, pngOf(SEED + 3));
    const created = await api.post(apiUrl(API_PATHS.documents('resume')), {
      headers: bearer(ownerToken),
      data: {
        values: {
          name: RESUME_NAME,
          position: 'Image tester',
          isMain: true,
          summary: [
            '<p>With pictures</p>',
            `<img src="${image.url}" data-media-id="${image.id}" alt="Media origin picture">`,
            `<img src="${FOREIGN_SRC}" data-media-id="${image.id}" alt="Foreign picture">`,
          ].join(''),
        },
      },
    });
    expect(created.status()).toBe(HTTP.CREATED);
    const draft = (await created.json()) as DraftRef;
    resumeId = draft.documentId;
    const published = await api.post(apiUrl(`${API_PATHS.document('resume', resumeId)}/publish`), {
      headers: bearer(ownerToken),
      data: { expectedVersion: draft.version },
    });
    expect(published.ok()).toBe(true);
  });

  test.afterAll(async () => {
    const removed = await api.delete(apiUrl(API_PATHS.document('resume', resumeId)), {
      headers: bearer(ownerToken),
    });
    expect(removed.status()).toBe(HTTP.NO_CONTENT);
    await api.dispose();
  });

  test('the CV shows the summary text and never a foreign image', async ({ page, request }) => {
    const html = await (await request.get(e2eEnv.webUrl)).text();
    expect(html).not.toContain('evil.example');

    await page.goto(e2eEnv.webUrl);
    await expect(page.getByRole('heading', { level: 1, name: RESUME_NAME })).toBeVisible();
    await expect(page.getByText('With pictures')).toBeVisible();
    await expect(page.locator('img[src*="evil.example"]')).toHaveCount(0);
  });
});
