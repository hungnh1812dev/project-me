import {
  type BrowserContext,
  expect,
  type Page,
  type Route,
  test,
} from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import { API_ERROR_CODES } from '../../cms-admin/src/config/http.constants';
import { MEDIA_ALT_MAX_LENGTH } from '../../cms-admin/src/config/media.constants';
import { e2eEnv } from '../src/env';

const copy = COPY.media;
const access = COPY.access;

const RUN_ID = Date.now().toString(36);
const FILE_NAME = `e2e-media-${RUN_ID}.png`;
const TEXT_FILE_NAME = `e2e-media-${RUN_ID}.txt`;
const ALT_TEXT = `E2E alt ${RUN_ID}`;
const ALT_PADDING = 'a';
const HTTP_CONFLICT = 409;
/** A 1x1 transparent PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_UNSUPPORTED = 415;
const HTTP_NOT_FOUND = 404;
const MEDIA_API_PATTERN = /\/api\/v1\/media(\/[0-9a-f-]+)?(\?.*)?$/;
const ALLOWED_TYPES = ['image/png', 'application/pdf', 'video/mp4'];
const FAKE_FILE_URL = `data:image/png;base64,${PNG_BASE64}`;
const FAKE_BYTES = 68;

interface FakeFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  url: string;
  thumbnailUrl: string | null;
  isReviewerPreset: boolean;
  createdAt: string;
}

/**
 * The smoke stack runs production mode with dummy Cloudinary credentials, so
 * real uploads cannot succeed there. The library is driven against an
 * in-memory stand-in for /media; the real API contract is covered by cms-api's
 * integration tests.
 */
async function fakeMediaApi(context: BrowserContext, inUse: Set<string>) {
  const files: FakeFile[] = [];
  const fail = (route: Route, status: number, errorCode: string) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: cors(route),
      body: JSON.stringify({
        statusCode: status,
        errorCode,
        message: errorCode,
      }),
    });
  await context.route(MEDIA_API_PATTERN, async (route) => {
    const request = route.request();
    const method = request.method();
    const headers = cors(route);
    if (method === 'OPTIONS') {
      return route.fulfill({ status: HTTP_NO_CONTENT, headers });
    }
    const id = new URL(request.url()).pathname.split('/').at(-1) ?? '';
    const found = files.find((f) => f.id === id);
    if (method === 'GET') {
      return route.fulfill({
        status: HTTP_OK,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({
          data: files,
          meta: { page: 1, pageSize: 20, total: files.length },
        }),
      });
    }
    if (method === 'POST') {
      const raw = request.postData() ?? '';
      const name = /filename="([^"]+)"/.exec(raw)?.[1] ?? 'file';
      const type = /Content-Type: ([^\r\n]+)/i.exec(raw)?.[1] ?? '';
      if (!ALLOWED_TYPES.includes(type)) {
        return fail(
          route,
          HTTP_UNSUPPORTED,
          API_ERROR_CODES.MEDIA_UNSUPPORTED_TYPE,
        );
      }
      const created: FakeFile = {
        id: crypto.randomUUID(),
        fileName: name,
        mimeType: type,
        size: FAKE_BYTES,
        width: 1,
        height: 1,
        alt: null,
        url: FAKE_FILE_URL,
        thumbnailUrl: null,
        isReviewerPreset: false,
        createdAt: new Date().toISOString(),
      };
      files.unshift(created);
      return route.fulfill({
        status: HTTP_CREATED,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(created),
      });
    }
    if (found === undefined) {
      return fail(route, HTTP_NOT_FOUND, API_ERROR_CODES.MEDIA_NOT_FOUND);
    }
    if (method === 'PATCH') {
      const body = request.postDataJSON() as { alt: string | null };
      found.alt = body.alt;
      return route.fulfill({
        status: HTTP_OK,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(found),
      });
    }
    if (inUse.has(found.fileName)) {
      return fail(route, HTTP_CONFLICT, API_ERROR_CODES.MEDIA_IN_USE);
    }
    files.splice(files.indexOf(found), 1);
    return route.fulfill({ status: HTTP_NO_CONTENT, headers });
  });
}

function cors(route: Route): Record<string, string> {
  const request = route.request();
  return {
    'access-control-allow-origin': request.headers()['origin'] ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers':
      request.headers()['access-control-request-headers'] ?? '*',
  };
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: COPY.login.emailLabel }).fill(email);
  await page.getByLabel(COPY.login.passwordLabel).fill(password);
  await page.getByRole('button', { name: COPY.login.submit }).click();
  await expect(
    page.getByRole('button', { name: COPY.session.signOut }),
  ).toBeVisible();
}

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
    await signIn(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
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
