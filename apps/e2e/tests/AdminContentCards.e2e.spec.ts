import { expect, test, type Locator, type Page } from '@playwright/test';

import { ADMIN_COPY, contentNewPath } from '../src/Apps.contract';
import { CV_PAGE_SLUG, HTTP, PROFILE_SLUG, RUN_ID } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { contentSaveButton } from '../src/Locators.fixture';
import { signInAs } from '../src/Session.fixture';

/** The opt-in dev-stack seed (`pnpm dev:stack:seed`) holds one image whose stored name starts with `seed-image`; on a stack without it the picker test uploads its own. */
const SEED_PICK_NAME = /^Select seed-image.*\.png$/;
const SEED_FILE_PATTERN = /seed-image.*\.png/;
const SURFACE_RADIUS_PX = '16px';
const TRANSPARENT = /rgba\(0, 0, 0, 0\)|transparent/;
const media = ADMIN_COPY.media;
const bulk = ADMIN_COPY.content.bulk;
/** A 1x1 PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const cardOf = (locator: Locator) =>
  locator.evaluate((el) => {
    const card = el.closest<HTMLElement>('[data-slot="card"]') ?? el;
    const cs = getComputedStyle(card);
    return {
      radius: cs.borderTopLeftRadius,
      borderColor: cs.borderTopColor,
      shadow: cs.boxShadow,
      nested: Boolean(card.parentElement?.closest('[data-slot="card"]')),
    };
  });

const ensureSeedImage = async (page: Page) => {
  await page.goto('/media');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (await page.getByText(SEED_FILE_PATTERN).first().isVisible()) return;
  await page.getByRole('button', { name: media.upload }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="file"]').setInputFiles({
    name: `seed-image-${RUN_ID}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  });
  const uploaded = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/media(\?.*)?$/.test(r.url()),
  );
  await dialog.getByRole('button', { name: /^Upload( \d+ files?)?$/ }).click();
  expect((await uploaded).ok()).toBe(true);
  await page.keyboard.press('Escape');
};

test.describe.serial('cms-admin content and media cards', () => {
  let page: Page;
  const consoleProblems: string[] = [];

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleProblems.push(message.text());
    });
    await signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  });

  test('picker: clickable media card raises on hover, shows halo plus edge on Tab, opens on Enter and Space', async () => {
    await ensureSeedImage(page);
    await page.goto(contentNewPath(PROFILE_SLUG));
    const field = page.getByRole('group', { name: 'Photo' });
    await field.getByRole('button', { name: media.input.choose }).click();
    const dialog = page.getByRole('dialog');
    const pick = dialog.getByRole('button', { name: SEED_PICK_NAME });
    await expect(pick).toBeVisible();
    const rest = await cardOf(pick);
    expect(rest.radius).toBe(SURFACE_RADIUS_PX);
    expect(rest.borderColor).toMatch(TRANSPARENT);
    await pick.hover();
    await expect.poll(async () => (await cardOf(pick)).shadow).not.toBe(rest.shadow);
    await page.mouse.move(0, 0);
    await dialog.getByRole('button', { name: media.picker.cancel }).focus();
    await page.keyboard.press('Shift+Tab');
    await pick.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(pick).toBeFocused();
    await expect.poll(() => pick.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('3px');
    expect(await pick.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(field).toContainText(SEED_FILE_PATTERN);
    await field.getByRole('button', { name: media.input.choose }).click();
    await dialog.getByRole('button', { name: SEED_PICK_NAME }).focus();
    await page.keyboard.press('Space');
    await expect(dialog).toBeHidden();
  });

  test('upload dialog and component list use cards without nesting', async () => {
    await page.goto('/media');
    await page.getByRole('button', { name: media.upload }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const nestedInDialog = await dialog.evaluate(
      (el) =>
        [...el.querySelectorAll('[data-slot="card"]')].filter((c) =>
          c.parentElement?.closest('[data-slot="card"]'),
        ).length,
    );
    expect(nestedInDialog).toBe(0);
    await dialog.locator('input[type="file"]').setInputFiles({
      name: `card-check-${RUN_ID}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_BASE64, 'base64'),
    });
    const queue = dialog.locator('[data-slot="card"]');
    await expect(queue).toHaveCount(1);
    const queueCard = await cardOf(queue);
    expect(queueCard.radius).toBe(SURFACE_RADIUS_PX);
    expect(queueCard.nested).toBe(false);
    await page.keyboard.press('Escape');

    await page.goto(contentNewPath(CV_PAGE_SLUG));
    await page.getByRole('button', { name: ADMIN_COPY.content.list.addSlot('Skills') }).click();
    const item = page.locator('main [data-slot="card"]').filter({ has: page.locator('input') });
    expect(await item.count()).toBeGreaterThan(0);
    const info = await cardOf(item.first());
    expect(info.radius).toBe(SURFACE_RADIUS_PX);
    expect(info.nested).toBe(false);
  });

  test('diff viewer block is a card in the merge modal', async () => {
    const b = await page.context().newPage();
    await page.goto(contentNewPath(CV_PAGE_SLUG));
    const position = (p: Page) => p.getByLabel('Position', { exact: true });
    await position(page).fill(`Base ${RUN_ID}`);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/content\/cv-page\/[0-9a-f-]{36}$/);
    const url = page.url();
    await b.goto(url);
    await expect(position(b)).toBeVisible();
    await position(b).fill(`B ${RUN_ID}`);
    const saveB = b.waitForResponse((r) => r.request().method() === 'PUT');
    await contentSaveButton(b).click();
    expect((await saveB).ok()).toBe(true);
    await position(page).fill(`A ${RUN_ID}`);
    const saveA = page.waitForResponse((r) => r.request().method() === 'PUT');
    await contentSaveButton(page).click();
    expect((await saveA).status()).toBe(HTTP.CONFLICT);
    const block = page.locator('[data-slot="diff-viewer-block"]').first();
    await expect(block).toBeVisible();
    const info = await cardOf(block);
    expect(info.radius).toBe(SURFACE_RADIUS_PX);
    expect(info.borderColor).toMatch(TRANSPARENT);
    expect(info.nested).toBe(false);
    await b.close();
  });

  test('cleanup: the conflict document is deleted so the collection stays empty', async () => {
    await page.goto(`/content/${CV_PAGE_SLUG}`);
    await page.getByRole('checkbox', { name: /^Select all documents/ }).check();
    const rows = await page.getByRole('row').count();
    const count = rows - 1;
    await page.getByRole('button', { name: bulk.delete(count) }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: bulk.deleteDialog.confirm(count) })
      .click();
    await expect(page.getByText('No documents yet')).toBeVisible();
  });

  test('no console error in the walk', () => {
    expect(
      consoleProblems.filter((entry) => !/\/auth\/|409|Conflict|401|Unauthorized/.test(entry)),
    ).toEqual([]);
  });
});
