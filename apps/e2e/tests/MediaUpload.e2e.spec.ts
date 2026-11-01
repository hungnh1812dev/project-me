import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

import {
  ADMIN_COPY,
  MAX_FILES_PER_BATCH,
  MAX_PARALLEL_UPLOADS,
  MEDIA_MAX_BYTES_BY_KIND,
} from '../src/Apps.contract';
import { HTTP, RUN_ID } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { fakeMediaApi, PNG_BASE64 } from '../src/FakeMediaApi.fixture';
import { signInAs } from '../src/Session.fixture';

const copy = ADMIN_COPY.media;
const dialogCopy = copy.uploadDialog;

const MEDIA_POST_PATTERN = /\/api\/v1\/media(\?.*)?$/;
const SLOW_UPLOAD_MS = 600;
const SETTLE_TIMEOUT_MS = 15_000;
const NO_NEW_REQUEST_WAIT_MS = 800;
const OVERLAY_CLICK_POSITION = { x: 5, y: 5 };
const FAILING_PREFIX = 'fail';
const PNG = Buffer.from(PNG_BASE64, 'base64');

const name = (label: string, extension = 'png') => `e2e-up-${RUN_ID}-${label}.${extension}`;
const png = (fileName: string) => ({ name: fileName, mimeType: 'image/png', buffer: PNG });

/** Counts the upload requests and holds or delays them; the stand-in library answers them. */
interface UploadTraffic {
  started: string[];
  maxInFlight: number;
  failedOnPurpose: string[];
  aborted: number;
  holdAll(): void;
  releaseAll(): void;
  setDelayMs(delayMs: number): void;
}

async function watchUploads(page: Page): Promise<UploadTraffic> {
  let inFlight = 0;
  let delayMs = 0;
  let held: Promise<void> | null = null;
  let release = () => {};
  const traffic: UploadTraffic = {
    started: [],
    maxInFlight: 0,
    failedOnPurpose: [],
    aborted: 0,
    holdAll: () => {
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    releaseAll: () => {
      release();
      held = null;
    },
    setDelayMs: (next) => {
      delayMs = next;
    },
  };
  page.on('requestfailed', (request) => {
    if (request.method() === 'POST' && MEDIA_POST_PATTERN.test(request.url())) traffic.aborted += 1;
  });
  await page.route(MEDIA_POST_PATTERN, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    const fileName = /filename="([^"]+)"/.exec(request.postData() ?? '')?.[1] ?? '';
    traffic.started.push(fileName);
    inFlight += 1;
    traffic.maxInFlight = Math.max(traffic.maxInFlight, inFlight);
    try {
      if (held !== null) await held;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (fileName.includes(FAILING_PREFIX) && !traffic.failedOnPurpose.includes(fileName)) {
        traffic.failedOnPurpose.push(fileName);
        return await route.fulfill({
          status: HTTP.SERVER_ERROR,
          contentType: 'application/json',
          headers: {
            'access-control-allow-origin': request.headers()['origin'] ?? '*',
            'access-control-allow-credentials': 'true',
          },
          body: JSON.stringify({ statusCode: 500, errorCode: 'INTERNAL_ERROR', message: 'x' }),
        });
      }
      return await route.fallback();
    } catch {
      return undefined; // the request was cancelled by the page
    } finally {
      inFlight -= 1;
    }
  });
  return traffic;
}

test.describe.serial('owner: upload dialog', () => {
  let context: BrowserContext;
  let page: Page;
  let traffic: UploadTraffic;

  const dialog = () => page.getByRole('dialog');
  const input = () => dialog().getByTestId('upload-dialog-input');
  const uploadButton = () => dialog().getByRole('button', { name: /^Upload( \d+ files?)?$/ });
  const rowOf = (fileName: string): Locator =>
    dialog().getByRole('listitem').filter({ hasText: fileName });

  const openDialog = async () => {
    await page.getByRole('button', { name: copy.upload, exact: true }).click();
    await expect(dialog().getByRole('heading', { name: dialogCopy.title })).toBeVisible();
  };

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    await fakeMediaApi(context, new Set());
    page = await context.newPage();
    await signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    await page.goto('/media');
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    traffic = await watchUploads(page);
  });

  test('an SVG and an over-limit image are flagged with reasons and never sent', async () => {
    const bigImage = {
      name: name('big'),
      mimeType: 'image/png',
      buffer: Buffer.alloc(MEDIA_MAX_BYTES_BY_KIND.image + 1),
    };
    await openDialog();
    await input().setInputFiles([
      png(name('ok')),
      { name: name('logo', 'svg'), mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') },
      bigImage,
    ]);
    await expect(rowOf(name('logo', 'svg'))).toContainText(dialogCopy.rejected['type-not-allowed']);
    await expect(rowOf(name('big'))).toContainText(dialogCopy.rejected['too-large']);
    await expect(dialog()).toContainText(dialogCopy.summary(1));
    expect(traffic.started).toHaveLength(0);

    await uploadButton().click();
    await expect(rowOf(name('ok'))).toContainText(dialogCopy.status.done);
    expect(traffic.started).toEqual([name('ok')]);
    await dialog().getByRole('button', { name: dialogCopy.close, exact: true }).click();
    await expect(dialog()).toBeHidden();
  });

  test('files beyond the batch cap are left out with a reason', async () => {
    await openDialog();
    const files = Array.from({ length: MAX_FILES_PER_BATCH + 2 }, (_, index) =>
      png(name(`cap${index}`)),
    );
    await input().setInputFiles(files);
    await expect(dialog()).toContainText(dialogCopy.summary(MAX_FILES_PER_BATCH));
    await expect(dialog().getByText(dialogCopy.rejected['batch-full'])).toHaveCount(2);
    expect(traffic.started).toHaveLength(0);
    await dialog().getByRole('button', { name: dialogCopy.cancel, exact: true }).click();
    await expect(dialog()).toBeHidden();
  });

  test('at most two files are in flight, one failure is retried alone, results reach the library', async () => {
    traffic.setDelayMs(SLOW_UPLOAD_MS);
    const failing = name(`${FAILING_PREFIX}-one`);
    const names = [name('a'), name('b'), failing, name('c'), name('d')];
    await openDialog();
    await input().setInputFiles(names.map(png));
    await uploadButton().click();

    await expect(
      dialog().getByRole('button', { name: dialogCopy.retryLabel(failing) }),
    ).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });
    await expect(dialog()).toContainText(dialogCopy.someFailed);
    expect(traffic.maxInFlight).toBe(MAX_PARALLEL_UPLOADS);
    expect(traffic.started).toHaveLength(names.length);

    await dialog()
      .getByRole('button', { name: dialogCopy.retryLabel(failing) })
      .click();
    await expect(rowOf(failing)).toContainText(dialogCopy.status.done, {
      timeout: SETTLE_TIMEOUT_MS,
    });
    expect(traffic.started.filter((sent) => sent === failing)).toHaveLength(2);
    expect(traffic.started).toHaveLength(names.length + 1);

    await dialog().getByRole('button', { name: dialogCopy.close, exact: true }).click();
    await expect(dialog()).toBeHidden();
    for (const fileName of names) {
      await expect(page.getByRole('listitem').filter({ hasText: fileName })).toBeVisible();
    }
  });

  test('closing mid-upload always asks; Keep continues; Stop cancels and sends nothing more', async () => {
    traffic.holdAll();
    const names = [name('h1'), name('h2'), name('h3'), name('h4')];
    await openDialog();
    await input().setInputFiles(names.map(png));
    expect(traffic.started).toHaveLength(0);
    await uploadButton().click();
    await expect.poll(() => traffic.started.length).toBe(MAX_PARALLEL_UPLOADS);

    const asksToStop = dialog().getByRole('heading', { name: dialogCopy.confirmTitle });
    const keepUploading = async () => {
      await expect(asksToStop).toBeVisible();
      await dialog().getByRole('button', { name: dialogCopy.confirmKeep }).click();
      await expect(dialog().getByRole('heading', { name: dialogCopy.title })).toBeVisible();
    };

    await page.keyboard.press('Escape');
    await keepUploading();
    await page.mouse.click(OVERLAY_CLICK_POSITION.x, OVERLAY_CLICK_POSITION.y);
    await keepUploading();
    await dialog().getByRole('button', { name: dialogCopy.cancel, exact: true }).click();
    await keepUploading();
    expect(traffic.started).toHaveLength(MAX_PARALLEL_UPLOADS);
    expect(traffic.aborted).toBe(0);

    await page.keyboard.press('Escape');
    await expect(asksToStop).toBeVisible();
    await dialog().getByRole('button', { name: dialogCopy.confirmStop }).click();
    await expect(dialog()).toBeHidden();
    await expect.poll(() => traffic.aborted).toBe(MAX_PARALLEL_UPLOADS);
    traffic.releaseAll();
    await page.waitForTimeout(NO_NEW_REQUEST_WAIT_MS);
    expect(traffic.started).toHaveLength(MAX_PARALLEL_UPLOADS);
  });
});
