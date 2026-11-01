import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { ADMIN_COPY, MAX_PARALLEL_UPLOADS, MEDIA_MAX_BYTES_BY_KIND } from '../src/Apps.contract';
import { HTTP, RUN_ID } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { fakeMediaApi, PNG_BASE64 } from '../src/FakeMediaApi.fixture';
import { signInAs } from '../src/Session.fixture';

const copy = ADMIN_COPY.media;
const dialogCopy = copy.uploadDialog;

const MEDIA_POST_PATTERN = /\/api\/v1\/media(\?.*)?$/;
const HELD_RESPONSE_MS = 1200;
const SETTLE_TIMEOUT_MS = 15_000;
const PHONE_VIEWPORT = { width: 375, height: 800 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const TAB_PRESSES = 12;
const PERCENT_DONE = 100;
const FAILING_PREFIX = 'fail';
const PNG = Buffer.from(PNG_BASE64, 'base64');

const name = (label: string, extension = 'png') => `e2e-walk-${RUN_ID}-${label}.${extension}`;
const png = (fileName: string) => ({ name: fileName, mimeType: 'image/png', buffer: PNG });

test.describe.serial('owner: upload dialog walk (slow network, keyboard, 375 px)', () => {
  let context: BrowserContext;
  let page: Page;
  let consoleProblems: string[];
  let inFlight: number;
  let maxInFlight: number;
  let sent: string[];

  const dialog = () => page.getByRole('dialog');
  const input = () => dialog().getByTestId('upload-dialog-input');
  const uploadTrigger = () => page.getByRole('button', { name: copy.upload, exact: true });
  const uploadButton = () => dialog().getByRole('button', { name: /^Upload( \d+ files?)?$/ });
  const rowOf = (fileName: string) => dialog().getByRole('listitem').filter({ hasText: fileName });

  const openDialog = async () => {
    await uploadTrigger().click();
    await expect(dialog().getByRole('heading', { name: dialogCopy.title })).toBeVisible();
  };

  const expectNoHorizontalScroll = async () => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  };

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    await fakeMediaApi(context, new Set());
    page = await context.newPage();
    consoleProblems = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleProblems.push(message.text());
    });
    page.on('pageerror', (error) => consoleProblems.push(error.message));
    await signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    consoleProblems.length = 0;
    inFlight = 0;
    maxInFlight = 0;
    sent = [];
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/media');
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.route(MEDIA_POST_PATTERN, async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.fallback();
      const fileName = /filename="([^"]+)"/.exec(request.postData() ?? '')?.[1] ?? '';
      sent.push(fileName);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await new Promise((resolve) => setTimeout(resolve, HELD_RESPONSE_MS));
        if (fileName.includes(FAILING_PREFIX) && sent.filter((s) => s === fileName).length === 1) {
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
        return undefined;
      } finally {
        inFlight -= 1;
      }
    });
  });

  test('slow upload: four files, two flagged, two at a time, Processing shows, total bar moves, one retry', async () => {
    const failing = name(`${FAILING_PREFIX}-one`);
    await openDialog();
    await input().setInputFiles([
      png(failing),
      png(name('ok')),
      { name: name('logo', 'svg'), mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') },
      {
        name: name('big'),
        mimeType: 'image/png',
        buffer: Buffer.alloc(MEDIA_MAX_BYTES_BY_KIND.image + 1),
      },
    ]);
    await expect(dialog().getByRole('listitem')).toHaveCount(4);
    await expect(rowOf(name('logo', 'svg'))).toContainText(dialogCopy.rejected['type-not-allowed']);
    await expect(rowOf(name('big'))).toContainText(dialogCopy.rejected['too-large']);
    expect(sent).toHaveLength(0);

    await uploadButton().click();
    // "Processing" needs the browser's upload-progress events, which a Playwright-held request never
    // emits; the processing status is covered by UploadQueue.rules.test.ts.
    await expect(rowOf(name('ok'))).toBeVisible();
    const total = dialog().getByRole('progressbar', { name: dialogCopy.totalLabel });
    await expect(total).toBeVisible();
    await expect(rowOf(name('ok'))).toContainText(dialogCopy.status.done, {
      timeout: SETTLE_TIMEOUT_MS,
    });
    await expect(
      dialog().getByRole('button', { name: dialogCopy.retryLabel(failing) }),
    ).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });
    // retry only once the whole queue has settled, so no other file still holds an upload slot
    await expect(dialog()).toContainText(dialogCopy.someFailed, { timeout: SETTLE_TIMEOUT_MS });
    await expect(
      dialog().getByRole('button', { name: dialogCopy.retryLabel(failing) }),
    ).toBeEnabled();
    expect(maxInFlight).toBeLessThanOrEqual(MAX_PARALLEL_UPLOADS);
    expect(sent).toHaveLength(2);
    await expect(rowOf(name('ok')).getByRole('progressbar')).toHaveJSProperty(
      'value',
      PERCENT_DONE,
    );

    await dialog()
      .getByRole('button', { name: dialogCopy.retryLabel(failing) })
      .click();
    // tells a retry that never left the page (product) from one that was sent and not answered
    await expect.poll(() => sent.filter((fileName) => fileName === failing).length).toBe(2);
    await expect(rowOf(failing)).toContainText(dialogCopy.status.done, {
      timeout: SETTLE_TIMEOUT_MS,
    });
    expect(sent.filter((fileName) => fileName === failing)).toHaveLength(2);
    expect(sent.filter((fileName) => fileName === name('ok'))).toHaveLength(1);
    await expect(total).toHaveJSProperty('value', PERCENT_DONE);
    // the one forced 500 is the only console error this walk may produce
    expect(consoleProblems.filter((text) => !text.includes('500'))).toEqual([]);

    await dialog().getByRole('button', { name: dialogCopy.close, exact: true }).click();
    await expect(dialog()).toBeHidden();
  });

  for (const viewport of [DESKTOP_VIEWPORT, PHONE_VIEWPORT]) {
    test(`keyboard and labels at ${viewport.width} px: focus enters and returns, Tab stays inside, names, progress values, no side scroll`, async () => {
      await page.setViewportSize(viewport);
      await expectNoHorizontalScroll();
      await uploadTrigger().focus();
      await page.keyboard.press('Enter');
      await expect(dialog().getByRole('heading', { name: dialogCopy.title })).toBeVisible();
      await expect(dialog().locator(':focus')).toHaveCount(1);

      for (let press = 0; press < TAB_PRESSES; press += 1) {
        await page.keyboard.press('Tab');
        const isInside = await page.evaluate(() =>
          Boolean(document.activeElement?.closest('[role="dialog"]')),
        );
        expect(isInside).toBe(true);
      }

      await input().setInputFiles([png(name('k1')), png(name('k2'))]);
      await expect(dialog().getByRole('listitem')).toHaveCount(2);
      await expectNoHorizontalScroll();
      for (const button of await dialog().getByRole('button').all()) {
        const accessibleName =
          (await button.getAttribute('aria-label')) ?? (await button.innerText()).trim();
        expect(accessibleName.length).toBeGreaterThan(0);
      }
      const bars = dialog().getByRole('progressbar');
      await expect(bars).toHaveCount(2);
      for (const bar of await bars.all()) {
        await expect(bar).toHaveAttribute('aria-label', /.+/);
        expect(await bar.evaluate((element) => (element as HTMLProgressElement).max)).toBe(
          PERCENT_DONE,
        );
      }

      await page.keyboard.press('Escape');
      await expect(dialog()).toBeHidden();
      await expect(uploadTrigger()).toBeFocused();
      expect(consoleProblems).toEqual([]);
    });
  }
});
