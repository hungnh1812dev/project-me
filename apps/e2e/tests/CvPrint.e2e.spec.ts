import { writeFileSync } from 'node:fs';

import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';

import { API_PATHS, apiUrl, BFF_PATHS } from '../src/Api.endpoints';
import { WEB_COPY } from '../src/Apps.contract';
import {
  commonTextValues,
  CV_PRINT_LABEL,
  CV_PRINT_SECRET_COMPANY_PREFIX,
  CV_PRINT_SECRET_EMAIL,
  CV_PRINT_SECRET_PHONE,
  cvPayload,
} from '../src/CvPrint.fixture';
import { HTTP, PAGE_CV_A_SLUG, PROFILE_SLUG } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { hasPdfTools, pdfInfo, pdfPageInk, pdfStrings, pdfText } from '../src/PdfTools.client';
import { clickAfterHumanCheck, withHumanCheck } from '../src/Session.fixture';

const CV_COMMON_TEXT_SLUG = 'cv-common-text';
const PHONE_WIDTH = 375;
const TABLET_WIDTH = 768;
const DESKTOP_WIDTH = 1280;
const VIEWPORT_HEIGHT = 900;
const MM_TO_PT = 72 / 25.4;
const SIDE_MARGIN_PT = 10 * MM_TO_PT;
const VERTICAL_MARGIN_PT = 12 * MM_TO_PT;
const MARGIN_TOLERANCE_PT = 2;
const A4_WIDTH_PT = 595;
const A4_HEIGHT_PT = 842;
const A4_TOLERANCE_PT = 2;
const PENDING_DELAY_MS = 3000;
const RANDOM_UUID = '11111111-2222-4333-8444-555555555555';

/**
 * apps/web CV print: the print button, the print-only layout and the PDF Chromium makes of it.
 * The PDF checks read the file with poppler (`pdftotext`, `pdfinfo`) and skip where it is not installed.
 * The spec publishes its own CV, profile and CV labels (newest wins) and removes them afterwards.
 */
test.describe('cv print', { tag: ['@web', '@cms-api', '@public-site'] }, () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  const CV_NAME = `E2E Print ${Date.now()}`;
  const CV_POSITION = 'Print Position';
  const SECRET_COMPANY = `${CV_PRINT_SECRET_COMPANY_PREFIX} ${Date.now()}`;

  let ownerToken = '';
  let cvUrl = '';
  let cvId = '';
  const created: [string, string][] = [];

  const ownerHeaders = () => ({ authorization: `Bearer ${ownerToken}` });

  const publish = async (
    request: APIRequestContext,
    slug: string,
    response: APIResponse,
  ): Promise<string> => {
    expect(response.status()).toBe(HTTP.CREATED);
    const draft = (await response.json()) as { documentId: string; version: number };
    created.push([slug, draft.documentId]);
    const published = await request.post(
      apiUrl(API_PATHS.documentPublish(slug, draft.documentId)),
      {
        headers: ownerHeaders(),
        data: { expectedVersion: draft.version },
      },
    );
    expect(published.ok()).toBe(true);
    return draft.documentId;
  };

  const create = (request: APIRequestContext, slug: string, data: object) =>
    request.post(apiUrl(API_PATHS.documents(slug)), { headers: ownerHeaders(), data });

  test.beforeAll(async ({ request }) => {
    const login = await request.post(apiUrl(API_PATHS.AUTH.LOGIN), {
      data: withHumanCheck({ email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword }),
    });
    ownerToken = ((await login.json()) as { accessToken: string }).accessToken;
    await publish(
      request,
      CV_COMMON_TEXT_SLUG,
      await create(request, CV_COMMON_TEXT_SLUG, { values: commonTextValues() }),
    );
    await publish(
      request,
      PROFILE_SLUG,
      await create(request, PROFILE_SLUG, {
        values: {
          name: 'E2E Print Profile',
          phone: CV_PRINT_SECRET_PHONE,
          email: CV_PRINT_SECRET_EMAIL,
          linkedin: 'https://www.linkedin.com/in/e2e-print',
        },
      }),
    );
    cvId = await publish(
      request,
      PAGE_CV_A_SLUG,
      await create(request, PAGE_CV_A_SLUG, cvPayload(CV_NAME, CV_POSITION, SECRET_COMPANY)),
    );
    cvUrl = `${e2eEnv.webUrl}/cv/${cvId}`;
  });

  test.afterAll(async ({ request }) => {
    for (const [slug, documentId] of created) {
      const removed = await request.delete(apiUrl(API_PATHS.document(slug, documentId)), {
        headers: ownerHeaders(),
      });
      expect(removed.status()).toBe(HTTP.NO_CONTENT);
    }
  });

  const printButton = (page: Page) =>
    page.getByRole('button', { name: CV_PRINT_LABEL, exact: true });

  const stubPrint = (page: Page) =>
    page.addInitScript(() => {
      const holder = window as unknown as { printCalls: number };
      holder.printCalls = 0;
      window.print = () => {
        holder.printCalls += 1;
      };
    });

  const printCalls = (page: Page) =>
    page.evaluate(() => (window as unknown as { printCalls: number }).printCalls);

  const box = async (locator: ReturnType<Page['locator']>) => {
    const rect = await locator.boundingBox();
    expect(rect).not.toBeNull();
    return rect as { x: number; y: number; width: number; height: number };
  };

  for (const width of [PHONE_WIDTH, TABLET_WIDTH, DESKTOP_WIDTH]) {
    test(`the print button sits top right over the header band at ${width}px, clear of the name`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await page.goto(cvUrl);
      await expect(printButton(page)).toHaveCount(1);
      const button = await box(printButton(page));
      const band = await box(page.locator('main header'));
      const name = await box(page.getByRole('heading', { level: 1, name: CV_NAME }));
      expect(button.x + button.width).toBeLessThanOrEqual(band.x + band.width);
      expect(button.y).toBeGreaterThanOrEqual(band.y);
      expect(button.y + button.height).toBeLessThanOrEqual(band.y + band.height);
      const overlaps =
        button.x < name.x + name.width &&
        button.x + button.width > name.x &&
        button.y < name.y + name.height &&
        button.y + button.height > name.y;
      expect(overlaps).toBe(false);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }

  test('a press calls window.print once and sends no request; Enter and Space work', async ({
    page,
  }) => {
    await stubPrint(page);
    await page.goto(cvUrl);
    await expect(printButton(page)).toBeVisible();
    expect(await printCalls(page)).toBe(0);
    const requests: string[] = [];
    page.on('request', (req) => requests.push(req.url()));
    await printButton(page).click();
    expect(await printCalls(page)).toBe(1);
    await printButton(page).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    expect(await printCalls(page)).toBe(3);
    expect(requests).toEqual([]);
  });

  test('no print button on /, /status and a CV that does not exist', async ({ page }) => {
    for (const path of ['/', '/status', `/cv/${RANDOM_UUID}`]) {
      await page.goto(`${e2eEnv.webUrl}${path}`);
      await expect(page.getByRole('banner')).toBeVisible();
      await expect(printButton(page)).toHaveCount(0);
    }
  });

  const signInReader = async (page: Page) => {
    await page.getByRole('button', { name: WEB_COPY.session.signIn, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: WEB_COPY.login.emailLabel }).fill(e2eEnv.readerEmail);
    await dialog.getByLabel(WEB_COPY.login.passwordLabel).fill(e2eEnv.readerPassword);
    await expect(dialog.locator('input[name="cf-turnstile-response"]')).not.toHaveValue('');
    await clickAfterHumanCheck(dialog.getByRole('button', { name: WEB_COPY.login.submit }));
  };

  test('no print button while the signed-in refetch is pending', async ({ page }) => {
    await page.route(`**${BFF_PATHS.CV}/${cvId}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, PENDING_DELAY_MS));
      await route.continue();
    });
    await page.goto(cvUrl);
    await expect(printButton(page)).toBeVisible();
    await signInReader(page);
    await expect(page.getByRole('button', { name: WEB_COPY.session.signOut })).toBeVisible();
    await expect(printButton(page)).toHaveCount(0);
    await expect(printButton(page)).toBeVisible({ timeout: PENDING_DELAY_MS * 3 });
  });

  for (const width of [PHONE_WIDTH, DESKTOP_WIDTH]) {
    test(`print media hides the site header, the menu and the print button at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await page.goto(cvUrl);
      await expect(printButton(page)).toBeVisible();
      await page.emulateMedia({ media: 'print' });
      await expect(printButton(page)).toBeHidden();
      await expect(page.getByRole('banner')).toBeHidden();
      await expect(
        page.getByRole('button', { name: WEB_COPY.session.signIn, exact: true }),
      ).toBeHidden();
      await expect(page.getByRole('heading', { level: 1, name: CV_NAME })).toBeVisible();
    });
  }

  test.describe('the A4 PDF', () => {
    test.skip(!hasPdfTools, 'poppler (pdftotext, pdfinfo) is not installed');

    const makePdf = async (
      page: Page,
      path: string,
      options: { displayHeaderFooter?: boolean; isOpen?: boolean } = {},
    ): Promise<string> => {
      if (!options.isOpen) await page.goto(cvUrl);
      await expect(page.getByRole('heading', { level: 1, name: CV_NAME })).toBeVisible();
      // The Next.js dev indicator is a dev-mode overlay that the dev stack would print.
      await page.evaluate(() =>
        document.querySelectorAll('nextjs-portal').forEach((node) => node.remove()),
      );
      writeFileSync(
        path,
        await page.pdf({
          format: 'A4',
          preferCSSPageSize: true,
          printBackground: true,
          displayHeaderFooter: options.displayHeaderFooter ?? false,
        }),
      );
      return path;
    };

    test('portrait A4, several pages, text inside the margins, no browser header or footer', async ({
      page,
    }, testInfo) => {
      const path = await makePdf(page, testInfo.outputPath('cv.pdf'), {
        displayHeaderFooter: true,
      });
      const meta = pdfInfo(path);
      expect(meta['Page size']).toMatch(/^59\d(\.\d+)? x 84\d(\.\d+)? pts \(A4\)/);
      const [widthPt, heightPt] = (meta['Page size'] ?? '').split(' x ').map(parseFloat);
      expect(Math.abs((widthPt ?? 0) - A4_WIDTH_PT)).toBeLessThan(A4_TOLERANCE_PT);
      expect(Math.abs((heightPt ?? 0) - A4_HEIGHT_PT)).toBeLessThan(A4_TOLERANCE_PT);
      expect(Number(meta['Pages'])).toBeGreaterThan(1);

      const pages = pdfPageInk(path, testInfo.outputPath('.'));
      expect(pages.length).toBe(Number(meta['Pages']));
      expect(pages[0]?.tintAtTop).toBe(true);
      expect(pages[0]?.tintAtEdges).toBe(true);
      for (const { ink } of pages) {
        expect(ink.left).toBeGreaterThanOrEqual(SIDE_MARGIN_PT - MARGIN_TOLERANCE_PT);
        expect(ink.right).toBeLessThanOrEqual(A4_WIDTH_PT - SIDE_MARGIN_PT + MARGIN_TOLERANCE_PT);
      }
      for (const { ink } of pages.slice(1)) {
        expect(ink.top).toBeGreaterThanOrEqual(VERTICAL_MARGIN_PT - MARGIN_TOLERANCE_PT);
        expect(ink.bottom).toBeLessThanOrEqual(
          A4_HEIGHT_PT - VERTICAL_MARGIN_PT + MARGIN_TOLERANCE_PT,
        );
      }

      const content = pdfText(path);
      expect(content).not.toMatch(/https?:\/\/(domain\.localhost|localhost)/);
      expect(content).not.toMatch(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
      expect(content).not.toMatch(/Page \d+ of \d+/i);
    });

    test('the title is name and position; the id and the URL are not in the PDF', async ({
      page,
    }, testInfo) => {
      const path = await makePdf(page, testInfo.outputPath('cv-title.pdf'));
      expect(pdfInfo(path)['Title']).toBe(`${CV_NAME} - ${CV_POSITION}`);
      const raw = pdfStrings(path);
      expect(raw).not.toContain(cvId);
      expect(pdfText(path)).not.toContain(cvId);
      expect(pdfText(path)).not.toContain(e2eEnv.webUrl);
    });

    test('links print as their text only and no masked value is in clear for a visitor', async ({
      page,
    }, testInfo) => {
      const path = await makePdf(page, testInfo.outputPath('cv-text.pdf'));
      const content = pdfText(path);
      expect(content).not.toContain(SECRET_COMPANY);
      expect(content).not.toContain(CV_PRINT_SECRET_PHONE);
      expect(content).not.toContain(CV_PRINT_SECRET_EMAIL);
      expect(content).not.toMatch(/\(https?:\/\/[^)]*\)/);
      expect(content.replace(/\s+/g, ' ')).toContain(CV_NAME.toUpperCase());
    });

    test('a signed-in reader prints the refetched data, the same as on screen', async ({
      page,
    }, testInfo) => {
      await page.goto(cvUrl);
      await signInReader(page);
      await expect(page.getByRole('button', { name: WEB_COPY.session.signOut })).toBeVisible();
      await expect(printButton(page)).toBeVisible();
      const onScreen = await page.getByText(SECRET_COMPANY).count();
      const path = await makePdf(page, testInfo.outputPath('cv-reader.pdf'), { isOpen: true });
      expect(pdfText(path).includes(SECRET_COMPANY)).toBe(onScreen > 0);
    });
  });
});
