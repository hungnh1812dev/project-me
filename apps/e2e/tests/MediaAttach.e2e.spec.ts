import { createHash } from 'node:crypto';

import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';

import { API_PATHS } from '../src/Api.endpoints';
import { ADMIN_COPY, contentNewPath } from '../src/Apps.contract';
import { PROFILE_SLUG, RUN_ID } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { contentSaveButton } from '../src/Locators.fixture';
import { signInAs } from '../src/Session.fixture';
import { insertLibraryFiles } from '../src/SmokeDatabase.client';

const copy = ADMIN_COPY.media;
const content = ADMIN_COPY.content;
const dialogCopy = copy.uploadDialog;

const EDIT_URL = /\/content\/profile\/[0-9a-f-]{36}$/;
const UUID = /^[0-9a-f-]{36}$/;
const FILE_NAME = `e2e-attach-${RUN_ID}.png`;
const SECOND_FILE_NAME = `e2e-attach-2-${RUN_ID}.png`;
const THIRD_FILE_NAME = `e2e-attach-3-${RUN_ID}.png`;
const PDF_FILE_NAME = `e2e-attach-${RUN_ID}.pdf`;
const VIDEO_FILE_NAME = `e2e-attach-${RUN_ID}.mp4`;
const TEXT_FILE_NAME = `e2e-attach-${RUN_ID}.txt`;
const PROFILE_NAME = `E2E profile ${RUN_ID}`;
const DOCUMENTS_PATH = API_PATHS.documents(PROFILE_SLUG);
/** A 1x1 transparent PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PREVIEW_HEIGHT_PX = 300;
const TOOLTIP_DELAY_MS = 700;
const BEFORE_TOOLTIP_MS = 300;
const SHORT_HASH_LENGTH = 8;
const shortHash = (name: string) =>
  (
    createHash('md5').update(name).digest('hex') + createHash('md5').update(name).digest('hex')
  ).slice(0, SHORT_HASH_LENGTH);
const png = () => Buffer.from(PNG_BASE64, 'base64');

// The profile form has one fieldset (the photo field); it has no accessible name.
const photoField = (page: Page) => page.getByRole('group', { name: 'Photo' });

/** The API route; the admin page `/media` has the same tail on another origin. */
const MEDIA_API_PATH = `${new URL(e2eEnv.apiBaseUrl).pathname}${API_PATHS.MEDIA}`;

const libraryCard = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name });

const isWrite = (request: Request) =>
  request.url().includes(DOCUMENTS_PATH) &&
  !request.url().endsWith('/presence') &&
  ['POST', 'PUT'].includes(request.method());

test.describe.serial('owner: attach media to a profile', () => {
  let context: BrowserContext;
  let page: Page;
  let editUrl = '';
  const consoleProblems: string[] = [];

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') consoleProblems.push(m.text());
    });
    await signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
    insertLibraryFiles([FILE_NAME, SECOND_FILE_NAME, THIRD_FILE_NAME]);
    insertLibraryFiles([PDF_FILE_NAME], 'application/pdf');
    insertLibraryFiles([VIDEO_FILE_NAME], 'video/mp4');
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('a new profile shows the empty photo field', async () => {
    await page.goto(contentNewPath(PROFILE_SLUG));
    await expect(photoField(page)).toContainText(copy.input.empty);
    await expect(photoField(page).getByRole('button', { name: copy.input.choose })).toBeVisible();
    await expect(photoField(page).getByRole('button', { name: copy.input.upload })).toBeVisible();
    const empty = photoField(page).locator('[data-slot="media-empty"]');
    await expect(empty).toHaveCSS('border-style', 'dashed');
    expect((await empty.boundingBox())?.height).toBe(PREVIEW_HEIGHT_PX);
  });

  test('the picker lists library files; cancel closes it', async () => {
    await photoField(page).getByRole('button', { name: copy.input.choose }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(copy.picker.title);
    await expect(dialog.getByRole('button', { name: copy.picker.select(FILE_NAME) })).toBeVisible();
    await dialog.getByRole('button', { name: copy.picker.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(photoField(page)).toContainText(copy.input.empty);
  });

  test('selecting a file shows its preview; saving sends only the uuid', async () => {
    await page.getByLabel('Name', { exact: true }).fill(PROFILE_NAME);
    await photoField(page).getByRole('button', { name: copy.input.choose }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.picker.select(FILE_NAME) })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(photoField(page)).toContainText(FILE_NAME);
    await expect(photoField(page).getByRole('img')).toBeVisible();
    await expect(photoField(page).locator('[data-slot="media-details"]')).toContainText(
      `${FILE_NAME} · ${shortHash(FILE_NAME)}`,
    );

    const [request] = await Promise.all([
      page.waitForRequest(isWrite),
      contentSaveButton(page).click(),
    ]);
    expect(request.method()).toBe('POST');
    const body = JSON.parse(request.postData() ?? '{}') as {
      values: { photo: unknown };
    };
    expect(typeof body.values.photo).toBe('string');
    expect(body.values.photo).toMatch(UUID);
    await expect(page).toHaveURL(EDIT_URL);
    editUrl = page.url();
  });

  test('the preview is 300 px tall without the footer and the footer lists the details', async () => {
    await page.goto(editUrl);
    const preview = photoField(page).locator('[data-slot="media-preview"]');
    expect((await preview.boundingBox())?.height).toBe(PREVIEW_HEIGHT_PX);
    await expect(preview.getByRole('img')).toHaveCSS('object-fit', 'contain');
    const details = photoField(page).locator('[data-slot="media-details"]');
    await expect(preview.locator('[data-slot="media-details"]')).toHaveCount(0);
    // The document embed carries no sha256 (finding), so a reloaded field shows the bare name.
    await expect(details).toContainText(FILE_NAME);
    await expect(details).toContainText('68 B');
    await expect(details.locator('[data-slot="media-provider"]')).toHaveText('cloudinary');
    await expect(details.locator('time')).toBeVisible();
    await expect(details.locator('[data-slot="media-dimensions"]')).toHaveText('1 × 1');
  });

  test('overlay buttons have names, a border and a tooltip after the delay', async () => {
    const preview = photoField(page).locator('[data-slot="media-preview"]');
    for (const label of [copy.input.replace, copy.input.choose, copy.input.remove]) {
      const button = preview.getByRole('button', { name: label });
      await expect(button).toBeVisible();
      await expect(button).toHaveCSS('border-top-width', '1px');
      await expect(button).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
    const replace = preview.getByRole('button', { name: copy.input.replace });
    await replace.hover();
    await page.waitForTimeout(BEFORE_TOOLTIP_MS);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: TOOLTIP_DELAY_MS * 2 });
    await expect(page.getByRole('tooltip')).toHaveText(copy.input.replace);
    await page.mouse.move(0, 0);
  });

  test('a PDF shows its icon and no dimension', async () => {
    await photoField(page).getByRole('button', { name: copy.input.choose }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.picker.select(PDF_FILE_NAME) })
      .click();
    const preview = photoField(page).locator('[data-slot="media-preview"]');
    await expect(photoField(page)).toContainText(PDF_FILE_NAME);
    await expect(preview.locator('svg.lucide-file-text')).toBeVisible();
    await expect(preview.getByRole('img')).toHaveCount(0);
    await expect(photoField(page).locator('[data-slot="media-dimensions"]')).toHaveCount(0);
    // Not saved: put the image back so later steps see the saved value.
    await page.reload();
    await expect(photoField(page)).toContainText(FILE_NAME);
  });

  test('a video shows its icon with a badge and never a video element', async () => {
    await photoField(page).getByRole('button', { name: copy.input.choose }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.picker.select(VIDEO_FILE_NAME) })
      .click();
    const preview = photoField(page).locator('[data-slot="media-preview"]');
    await expect(preview.locator('[data-slot="media-video-badge"]')).toHaveText(copy.videoBadge);
    await expect(page.locator('video')).toHaveCount(0);
    await page.reload();
  });

  test('the field is keyboard operable and does not scroll sideways at 375 px', async () => {
    const mobileWidth = 375;
    const mobileHeight = 800;
    await page.setViewportSize({ width: mobileWidth, height: mobileHeight });
    await page.goto(editUrl);
    const replace = photoField(page).getByRole('button', { name: copy.input.replace });
    await replace.focus();
    await expect(replace).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(photoField(page).getByRole('button', { name: copy.input.choose })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(photoField(page).getByRole('button', { name: copy.input.remove })).toBeFocused();
    await page.keyboard.press('Escape');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await replace.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('closing the upload dialog returns focus to the field button', async () => {
    await page.goto(editUrl);
    const replace = photoField(page).getByRole('button', { name: copy.input.replace });
    await replace.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(replace).toBeFocused();
  });

  test('after a reload the saved photo shows with a loaded preview', async () => {
    await page.goto(editUrl);
    await expect(photoField(page)).toContainText(FILE_NAME);
    const img = photoField(page).getByRole('img');
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    await expect(photoField(page).getByRole('button', { name: copy.input.replace })).toBeVisible();
  });

  test('an unsupported file in the upload dialog is flagged and never sent', async () => {
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(MEDIA_API_PATH)) posts += 1;
    });
    await photoField(page).getByRole('button', { name: copy.input.replace }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: dialogCopy.titleOne })).toBeVisible();
    await dialog.getByTestId('upload-dialog-input').setInputFiles({
      name: TEXT_FILE_NAME,
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await expect(dialog).toContainText(dialogCopy.rejected['type-not-allowed']);
    expect(posts).toBe(0);
    await dialog.getByRole('button', { name: dialogCopy.cancel, exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(photoField(page)).toContainText(FILE_NAME);
  });

  test('replacing the file swaps it; saving sends the new uuid', async () => {
    await photoField(page).getByRole('button', { name: copy.input.choose }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.picker.select(SECOND_FILE_NAME) })
      .click();
    await expect(photoField(page)).toContainText(SECOND_FILE_NAME);
    const [request] = await Promise.all([
      page.waitForRequest(isWrite),
      contentSaveButton(page).click(),
    ]);
    expect(request.method()).toBe('PUT');
    await expect(page.getByText(content.saved)).toBeVisible();
    await page.reload();
    await expect(photoField(page)).toContainText(SECOND_FILE_NAME);
    await page.goto('/media');
    await expect(libraryCard(page, FILE_NAME)).toBeVisible();
    await page.goto(editUrl);
  });

  test('an attached file cannot be deleted from the library (in use)', async () => {
    await page.goto('/media');
    await page.getByRole('button', { name: copy.deleteLabel(SECOND_FILE_NAME) }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: copy.deleteDialog.submit(SECOND_FILE_NAME) }).click();
    await expect(dialog).toContainText(copy.errors.inUse);
    await dialog.getByRole('button', { name: copy.deleteDialog.cancel }).click();
    await expect(dialog).toBeHidden();
    // The page behind an open dialog is aria-hidden, so check the card after.
    await expect(libraryCard(page, SECOND_FILE_NAME)).toBeVisible();
  });

  test('removing the photo and saving clears it; the file stays, then deletes', async () => {
    await page.goto(editUrl);
    await photoField(page).getByRole('button', { name: copy.input.remove }).click();
    await expect(photoField(page)).toContainText(copy.input.empty);
    const [request] = await Promise.all([
      page.waitForRequest(isWrite),
      contentSaveButton(page).click(),
    ]);
    const body = JSON.parse(request.postData() ?? '{}') as {
      values: { photo: unknown };
    };
    expect(body.values.photo).toBeNull();
    await expect(page.getByText(content.saved)).toBeVisible();
    await page.reload();
    await expect(photoField(page)).toContainText(copy.input.empty);

    await page.goto('/media');
    await expect(libraryCard(page, SECOND_FILE_NAME)).toBeVisible();
    await page.getByRole('button', { name: copy.deleteLabel(SECOND_FILE_NAME) }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.deleteDialog.submit(SECOND_FILE_NAME) })
      .click();
    await expect(libraryCard(page, SECOND_FILE_NAME)).toHaveCount(0);
  });

  test('uploading in the field attaches the new file; the console stayed clean', async () => {
    // Real uploads cannot succeed on the smoke stack (dummy Cloudinary), so the
    // POST answers with the seeded third file; the attach and save are real.
    // The list body is read inside the route handler: reading it from a
    // response promise fails when the page navigates away first.
    type Listed = { data: Array<{ fileName: string }> };
    let third: { fileName: string } | undefined;
    await page.route(
      (url) => url.pathname === MEDIA_API_PATH,
      async (route) => {
        const method = route.request().method();
        if (method === 'GET') {
          const response = await route.fetch();
          if (response.ok()) {
            const body = (await response.json()) as Listed;
            third = body.data.find((f) => f.fileName === THIRD_FILE_NAME) ?? third;
          }
          return route.fulfill({ response });
        }
        if (method !== 'POST') return route.fallback();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          headers: {
            'access-control-allow-origin': route.request().headers()['origin'] ?? '*',
            'access-control-allow-credentials': 'true',
          },
          body: JSON.stringify(third),
        });
      },
    );
    await page.goto('/media');
    await expect(libraryCard(page, THIRD_FILE_NAME)).toBeVisible();
    expect(third).toBeDefined();
    await page.goto(editUrl);
    await photoField(page).getByRole('button', { name: copy.input.upload }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('upload-dialog-input').setInputFiles({
      name: THIRD_FILE_NAME,
      mimeType: 'image/png',
      buffer: png(),
    });
    await dialog.getByRole('button', { name: /^Upload( 1 file)?$/ }).click();
    await expect(dialog).toContainText(dialogCopy.status.done);
    await dialog.getByRole('button', { name: dialogCopy.close, exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(photoField(page)).toContainText(THIRD_FILE_NAME);
    await expect(photoField(page).getByRole('img')).toBeVisible();
    const [request] = await Promise.all([
      page.waitForRequest(isWrite),
      contentSaveButton(page).click(),
    ]);
    expect(request.method()).toBe('PUT');
    await expect(page.getByText(content.saved)).toBeVisible();
    await page.unroute(() => true);
    // Deliberate 4xx responses (unsupported type, in-use) log console errors.
    expect(consoleProblems.filter((m) => !m.includes('status of 4'))).toEqual([]);
  });
});
