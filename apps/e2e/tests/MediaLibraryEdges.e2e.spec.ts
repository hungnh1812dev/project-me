import { expect, test, type Locator, type Page } from '@playwright/test';

import { ADMIN_COPY, MEDIA_DEFAULT_PAGE_SIZE } from '../src/Apps.contract';
import { HTTP, RUN_ID } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { pngOf } from '../src/Png.fixture';
import { signInAs } from '../src/Session.fixture';
import { insertLibraryFiles } from '../src/SmokeDatabase.client';

const copy = ADMIN_COPY.media;

const PREFIX = `e2e-edge-${RUN_ID}`;
const FILE_COUNT = MEDIA_DEFAULT_PAGE_SIZE;
const UPLOAD_SETTLE_MS = 20_000;
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

const nameOf = (index: number) => `${PREFIX}-${String(index).padStart(2, '0')}.png`;
const PREVIEW_HEIGHT_PX = 200;
const PAGE_SIZES = [10, 20, 50, 100];
const PHONE_WIDTH = 375;
const PHONE_HEIGHT = 800;
const DESKTOP_WIDTH = 1280;
const DESKTOP_HEIGHT = 720;
const PDF_NAME = `${PREFIX}-doc.pdf`;

const cards = (page: Page) =>
  page.getByRole('list', { name: copy.grid.label }).getByRole('listitem');
const cardOf = (page: Page, name: string): Locator => cards(page).filter({ hasText: name });
/** The upload dialog stays open after a batch; close it when it is still there. */
const closeDialog = async (page: Page) => {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    await dialog
      .getByRole('button', { name: copy.uploadDialog.close, exact: true })
      .first()
      .click();
  }
  await expect(dialog).toBeHidden();
};
const searchBox = (page: Page) => page.getByLabel(copy.filters.search);

test.describe.serial('owner: file library edge states with the real API', () => {
  let page: Page;
  const problems: string[] = [];

  test.beforeAll(async ({ browser }) => {
    insertLibraryFiles(Array.from({ length: FILE_COUNT }, (_, index) => nameOf(index)));
    insertLibraryFiles([PDF_NAME], 'application/pdf');
    page = await (await browser.newContext()).newPage();
    await signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
    // The logged-out boot probes /auth/refresh and gets a 401; only count what follows sign-in.
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() === HTTP.UNAUTHORIZED) problems.push(`401 ${response.url()}`);
    });
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto('/media');
  });

  test('a PDF card shows an icon, no video badge, and no original link', async () => {
    await searchBox(page).fill(PDF_NAME);
    const card = cardOf(page, PDF_NAME);
    await expect(card).toHaveCount(1);
    await expect(card.getByText(copy.videoBadge)).toHaveCount(0);
    await expect(card.locator('img')).toHaveCount(0);
    await expect(card.locator('svg').first()).toBeVisible();
  });

  test('an image card links to the original with a safe rel', async () => {
    await searchBox(page).fill(nameOf(0));
    const link = cardOf(page, nameOf(0)).getByRole('link', {
      name: copy.grid.viewOriginal(nameOf(0)),
    });
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('deleting the only card of the last page moves to the previous page', async () => {
    await searchBox(page).fill(PREFIX);
    await page.getByRole('button', { name: copy.pagination.next }).click();
    await expect(cards(page)).toHaveCount(1);
    const name =
      (await cards(page).first().innerText()).match(/e2e-edge-\S+?\.(png|pdf)/)?.[0] ?? '';
    await cards(page)
      .first()
      .getByRole('button', { name: copy.deleteLabel(name) })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.deleteDialog.submit(name) })
      .click();
    await expect(page.getByText(copy.deleteDialog.deleted(name))).toBeVisible();
    await expect(cards(page)).toHaveCount(MEDIA_DEFAULT_PAGE_SIZE);
  });

  test('the keyboard reaches an overlay action, opens its dialog and returns focus on Escape', async () => {
    await searchBox(page).fill(nameOf(1));
    const card = cardOf(page, nameOf(1));
    const trigger = card.getByRole('button', { name: copy.deleteLabel(nameOf(1)) });
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('the grid shows 10 cards per page, previews of 200 px, a type filter in order and a size picker', async () => {
    await page.goto(`/media?search=${PREFIX}`);
    await expect(cards(page)).toHaveCount(MEDIA_DEFAULT_PAGE_SIZE);
    const preview = cardOf(page, nameOf(1)).locator('img').first();
    const box = await preview.evaluate(
      (element) => element.parentElement?.getBoundingClientRect().height,
    );
    expect(box).toBe(PREVIEW_HEIGHT_PX);
    const types = page.getByLabel(copy.filters.mimeType);
    const options = await types.locator('option').allInnerTexts();
    expect(options).toEqual(Object.values(copy.filters.mimeOptions));
    const sizes = page.getByLabel(copy.filters.pageSize);
    const sizeOptions = await sizes.locator('option').allInnerTexts();
    expect(sizeOptions).toEqual(PAGE_SIZES.map((size) => copy.filters.pageSizeOption(size)));
  });

  test('the grid has one column at 375 px', async () => {
    await page.setViewportSize({ width: PHONE_WIDTH, height: PHONE_HEIGHT });
    await page.goto(`/media?search=${PREFIX}`);
    await expect(cards(page).first()).toBeVisible();
    const lefts = await cards(page).evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().left)),
    );
    expect(new Set(lefts).size).toBe(1);
    await page.setViewportSize({ width: DESKTOP_WIDTH, height: DESKTOP_HEIGHT });
  });

  test('replacing with the same family keeps the card and changes the hash; another family is refused', async () => {
    await searchBox(page).fill(nameOf(2));
    const card = cardOf(page, nameOf(2));
    const before = await card.innerText();
    await card.getByRole('button', { name: copy.grid.replaceLabel(nameOf(2)) }).click();
    const dialog = page.getByRole('dialog');
    const input = dialog.getByTestId('upload-dialog-input');
    await input.setInputFiles({ name: PDF_NAME, mimeType: 'application/pdf', buffer: PDF_BYTES });
    await expect(dialog).toContainText(copy.uploadDialog.rejected['type-not-allowed']);
    await input.setInputFiles({
      name: nameOf(2),
      mimeType: 'image/png',
      buffer: pngOf(FILE_COUNT + 50),
    });
    await dialog.getByRole('button', { name: /^Upload/ }).click();
    await expect(page.getByText(copy.replaced(nameOf(2)))).toBeVisible({
      timeout: UPLOAD_SETTLE_MS,
    });
    await closeDialog(page);
    await expect(cardOf(page, nameOf(2))).toHaveCount(1);
    await expect.poll(async () => cardOf(page, nameOf(2)).innerText()).not.toBe(before);
  });

  test('the console stayed clean', () => {
    expect(problems).toEqual([]);
  });
});

const LIMITED_EMAIL = process.env.E2E_MEDIA_LIMITED_EMAIL;
const LIMITED_PASSWORD = process.env.E2E_MEDIA_LIMITED_PASSWORD;

test.describe('owner-like account with media:read only', () => {
  test.skip(
    LIMITED_EMAIL === undefined || LIMITED_PASSWORD === undefined,
    'needs E2E_MEDIA_LIMITED_EMAIL and E2E_MEDIA_LIMITED_PASSWORD (a role holding only media:read)',
  );

  test('sees the cards but no replace, alt text, delete or upload action', async ({ page }) => {
    await signInAs(page, LIMITED_EMAIL ?? '', LIMITED_PASSWORD ?? '');
    await page.goto('/media');
    await expect(cards(page).first()).toBeVisible();
    const card = cards(page).first();
    await expect(card.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.upload, exact: true })).toHaveCount(0);
  });
});
