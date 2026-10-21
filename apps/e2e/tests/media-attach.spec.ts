import {
  type BrowserContext,
  expect,
  type Page,
  type Request,
  test,
} from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import { contentNewPath } from '../../cms-admin/src/config/routes';
import { e2eEnv } from '../src/env';
import { seedMediaFiles } from '../src/seed-media';

const copy = COPY.media;
const content = COPY.content;

const PROFILE_SLUG = 'profile';
const EDIT_URL = /\/content\/profile\/[0-9a-f-]{36}$/;
const UUID = /^[0-9a-f-]{36}$/;
const RUN_ID = Date.now().toString(36);
const FILE_NAME = `e2e-attach-${RUN_ID}.png`;
const SECOND_FILE_NAME = `e2e-attach-2-${RUN_ID}.png`;
const THIRD_FILE_NAME = `e2e-attach-3-${RUN_ID}.png`;
const TEXT_FILE_NAME = `e2e-attach-${RUN_ID}.txt`;
const PROFILE_NAME = `E2E profile ${RUN_ID}`;
const DOCUMENTS_PATH = `/documents/${PROFILE_SLUG}`;
/** A 1x1 transparent PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const png = () => Buffer.from(PNG_BASE64, 'base64');

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: COPY.login.emailLabel }).fill(email);
  await page.getByLabel(COPY.login.passwordLabel).fill(password);
  await page.getByRole('button', { name: COPY.login.submit }).click();
  await expect(
    page.getByRole('button', { name: COPY.session.signOut }),
  ).toBeVisible();
}

// The profile form has one fieldset (the photo field); it has no accessible name.
const photoField = (page: Page) => page.getByRole('group');

const saveButton = (page: Page) =>
  page.getByRole('button', { name: content.save, exact: true });

const libraryRow = (page: Page, name: string) =>
  page.getByRole('row').filter({ hasText: name });

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
    await signIn(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
    seedMediaFiles([FILE_NAME, SECOND_FILE_NAME, THIRD_FILE_NAME]);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('a new profile shows the empty photo field', async () => {
    await page.goto(contentNewPath(PROFILE_SLUG));
    await expect(photoField(page)).toContainText(copy.input.empty);
    await expect(
      photoField(page).getByRole('button', { name: copy.input.choose }),
    ).toBeVisible();
    await expect(
      photoField(page).getByRole('button', { name: copy.input.upload }),
    ).toBeVisible();
  });

  test('the picker lists library files; cancel closes it', async () => {
    await photoField(page)
      .getByRole('button', { name: copy.input.choose })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(copy.picker.title);
    await expect(
      dialog.getByRole('button', { name: copy.picker.select(FILE_NAME) }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: copy.picker.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(photoField(page)).toContainText(copy.input.empty);
  });

  test('selecting a file shows its preview; saving sends only the uuid', async () => {
    await page.getByLabel('Name', { exact: true }).fill(PROFILE_NAME);
    await photoField(page)
      .getByRole('button', { name: copy.input.choose })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.picker.select(FILE_NAME) })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(photoField(page)).toContainText(FILE_NAME);
    await expect(photoField(page).getByRole('img')).toBeVisible();

    const [request] = await Promise.all([
      page.waitForRequest(isWrite),
      saveButton(page).click(),
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

  test('after a reload the saved photo shows with a loaded preview', async () => {
    await page.goto(editUrl);
    await expect(photoField(page)).toContainText(FILE_NAME);
    const img = photoField(page).getByRole('img');
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    await expect(
      photoField(page).getByRole('button', { name: copy.input.replace }),
    ).toBeVisible();
  });

  test('an unsupported file uploaded in the field shows the reason', async () => {
    await photoField(page)
      .getByTestId('media-file-input')
      .setInputFiles({
        name: TEXT_FILE_NAME,
        mimeType: 'text/plain',
        buffer: Buffer.from('hello'),
      });
    // The field error renders next to the fieldset, not inside it.
    await expect(page.getByText(copy.errors.unsupportedType)).toBeVisible();
    await expect(photoField(page)).toContainText(FILE_NAME);
  });

  test('replacing the file swaps it; saving sends the new uuid', async () => {
    await photoField(page)
      .getByRole('button', { name: copy.input.replace })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.picker.select(SECOND_FILE_NAME) })
      .click();
    await expect(photoField(page)).toContainText(SECOND_FILE_NAME);
    const [request] = await Promise.all([
      page.waitForRequest(isWrite),
      saveButton(page).click(),
    ]);
    expect(request.method()).toBe('PUT');
    await expect(page.getByText(content.saved)).toBeVisible();
    await page.reload();
    await expect(photoField(page)).toContainText(SECOND_FILE_NAME);
  });

  test('an attached file cannot be deleted from the library (in use)', async () => {
    await page.goto('/media');
    await page
      .getByRole('button', { name: copy.deleteLabel(SECOND_FILE_NAME) })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('button', { name: copy.deleteDialog.submit(SECOND_FILE_NAME) })
      .click();
    await expect(dialog).toContainText(copy.errors.inUse);
    await dialog
      .getByRole('button', { name: copy.deleteDialog.cancel })
      .click();
    await expect(dialog).toBeHidden();
    // The page behind an open dialog is aria-hidden, so check the row after.
    await expect(libraryRow(page, SECOND_FILE_NAME)).toBeVisible();
  });

  test('removing the photo and saving clears it; the file stays, then deletes', async () => {
    await page.goto(editUrl);
    await photoField(page)
      .getByRole('button', { name: copy.input.remove })
      .click();
    await expect(photoField(page)).toContainText(copy.input.empty);
    const [request] = await Promise.all([
      page.waitForRequest(isWrite),
      saveButton(page).click(),
    ]);
    const body = JSON.parse(request.postData() ?? '{}') as {
      values: { photo: unknown };
    };
    expect(body.values.photo).toBeNull();
    await expect(page.getByText(content.saved)).toBeVisible();
    await page.reload();
    await expect(photoField(page)).toContainText(copy.input.empty);

    await page.goto('/media');
    await expect(libraryRow(page, SECOND_FILE_NAME)).toBeVisible();
    await page
      .getByRole('button', { name: copy.deleteLabel(SECOND_FILE_NAME) })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.deleteDialog.submit(SECOND_FILE_NAME) })
      .click();
    await expect(libraryRow(page, SECOND_FILE_NAME)).toHaveCount(0);
  });

  test('uploading in the field attaches the new file; the console stayed clean', async () => {
    // Real uploads cannot succeed on the smoke stack (dummy Cloudinary), so the
    // POST answers with the seeded third file; the attach and save are real.
    const listed = page
      .waitForResponse(
        (r) =>
          r.url().includes('/api/v1/media') && r.request().method() === 'GET',
      )
      .then((r) => r.json() as Promise<{ data: Array<{ fileName: string }> }>);
    await page.goto('/media');
    const library = await listed;
    const third = library.data.find((f) => f.fileName === THIRD_FILE_NAME);
    expect(third).toBeDefined();
    await page.route(
      (url) => url.pathname.endsWith('/media'),
      (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          headers: {
            'access-control-allow-origin':
              route.request().headers()['origin'] ?? '*',
            'access-control-allow-credentials': 'true',
          },
          body: JSON.stringify(third),
        });
      },
    );
    await page.goto(editUrl);
    await photoField(page).getByTestId('media-file-input').setInputFiles({
      name: THIRD_FILE_NAME,
      mimeType: 'image/png',
      buffer: png(),
    });
    await expect(photoField(page)).toContainText(THIRD_FILE_NAME);
    await expect(photoField(page).getByRole('img')).toBeVisible();
    const [request] = await Promise.all([
      page.waitForRequest(isWrite),
      saveButton(page).click(),
    ]);
    expect(request.method()).toBe('PUT');
    await expect(page.getByText(content.saved)).toBeVisible();
    await page.unroute(() => true);
    // Deliberate 4xx responses (unsupported type, in-use) log console errors.
    expect(consoleProblems.filter((m) => !m.includes('status of 4'))).toEqual(
      [],
    );
  });
});
