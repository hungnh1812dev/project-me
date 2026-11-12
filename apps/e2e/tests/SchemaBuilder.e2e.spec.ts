import { readdirSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import { expect, test, type Page, type Request } from '@playwright/test';

import { ADMIN_COPY } from '../src/Apps.contract';
import { CV_PAGE_SLUG } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import {
  chooseUserMenuItem,
  expectSignedIn,
  signInAsOwner,
  submitLogin,
} from '../src/Session.fixture';

const copy = ADMIN_COPY.schemaBuilder;
const leave = ADMIN_COPY.common.leaveDialog;
const nav = ADMIN_COPY.access.nav;

const SCHEMA_DIR = new URL('../../cms-api/content/schemas/', import.meta.url);
const CV_PAGE_FILE = 'cv-page.json';
const VALIDATE_URL = '**/content-types/validate';
const VALIDATE_PATH_PART = 'content-types/validate';
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 800 };
const BLOCKED_STATUS = 429;
const EDITED_SLUG = 'cv-page-edited';

const schemaFiles = readdirSync(SCHEMA_DIR).filter((name) => name.endsWith('.json'));
const readSchema = (name: string) => readFileSync(new URL(name, SCHEMA_DIR), 'utf8');

const openBuilder = async (page: Page) => {
  await page.goto('/schema-builder');
  await expect(page.getByRole('heading', { level: 1, name: copy.title })).toBeVisible();
};

const importText = async (page: Page, text: string) => {
  await page.getByRole('button', { name: copy.start.importJson }).click();
  const dialog = page.getByRole('dialog', { name: copy.import.title });
  await dialog.getByLabel(copy.import.textLabel).fill(text);
  await dialog.getByRole('button', { name: copy.import.submit }).click();
  return dialog;
};

const validCheck = (page: Page) => page.getByText(copy.validation.valid, { exact: true });
const slugInput = (page: Page) => page.getByLabel(copy.typeKeys.slug);

test.describe('schema builder (owner only)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
  });

  test('owner sees the menu item; admin and reviewer get the forbidden card and send no validate request', async ({
    page,
    browser,
  }) => {
    await signInAsOwner(page);
    const menu = page.getByRole('navigation', { name: nav.label });
    await menu.getByRole('link', { name: copy.title }).click();
    await expect(page).toHaveURL(/\/schema-builder$/);
    await expect(page.getByRole('button', { name: copy.start.newType })).toBeVisible();

    const credentials = [
      [e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword],
      [e2eEnv.readerEmail, e2eEnv.readerPassword],
    ] as const;
    for (const [email, password] of credentials) {
      const other = await (await browser.newContext()).newPage();
      const validateRequests: Request[] = [];
      other.on('request', (request) => {
        if (request.url().includes(VALIDATE_PATH_PART)) validateRequests.push(request);
      });
      await submitLogin(other, email, password);
      await expectSignedIn(other);
      await expect(
        other.getByRole('navigation', { name: nav.label }).getByRole('link', { name: copy.title }),
      ).toHaveCount(0);
      await other.goto('/schema-builder');
      await expect(other.getByText(copy.forbidden)).toBeVisible();
      await expect(other.getByRole('button', { name: copy.start.newType })).toHaveCount(0);
      expect(validateRequests).toHaveLength(0);
      await other.context().close();
    }
  });

  test('import refusals keep the current work; cv-page loads; restart asks first', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await openBuilder(page);

    let dialog = await importText(page, 'not json');
    await expect(dialog.getByText(copy.import.refusal.notJson)).toBeVisible();
    await dialog.getByLabel(copy.import.textLabel).fill('{"slug":"x"}');
    await dialog.getByRole('button', { name: copy.import.submit }).click();
    await expect(dialog.getByText(copy.import.refusal.fieldsMissing)).toBeVisible();
    await dialog.getByRole('button', { name: copy.import.cancel }).click();
    await expect(page.getByRole('button', { name: copy.start.newType })).toBeVisible();

    dialog = await importText(page, readSchema(CV_PAGE_FILE));
    await expect(dialog).toBeHidden();
    await expect(slugInput(page)).toHaveValue(CV_PAGE_SLUG);
    await expect(validCheck(page)).toBeVisible();

    // Unchanged work: restart needs no question.
    await page.getByRole('button', { name: copy.start.newType }).click();
    await expect(page.getByRole('dialog', { name: copy.restartDialog.title })).toHaveCount(0);

    // Changed work: restart asks, keeping works, confirming replaces.
    await slugInput(page).fill(EDITED_SLUG);
    await page.getByRole('button', { name: copy.start.newType }).click();
    const restart = page.getByRole('dialog', { name: copy.restartDialog.title });
    await restart.getByRole('button', { name: copy.restartDialog.cancel }).click();
    await expect(slugInput(page)).toHaveValue(EDITED_SLUG);
    await page.getByRole('button', { name: copy.start.newType }).click();
    await restart.getByRole('button', { name: copy.restartDialog.confirm }).click();
    await expect(slugInput(page)).not.toHaveValue(EDITED_SLUG);
  });

  test('live check: one call per pause with the right body, error path shown, then fixed', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await openBuilder(page);
    await importText(page, readSchema(CV_PAGE_FILE));
    await expect(validCheck(page)).toBeVisible();

    const bodies: unknown[] = [];
    page.on('request', (request) => {
      if (request.url().includes(VALIDATE_PATH_PART) && request.method() === 'POST') {
        bodies.push(request.postDataJSON());
      }
    });
    await slugInput(page).pressSequentially('X', { delay: 50 });
    await slugInput(page).pressSequentially('Y', { delay: 50 });
    await expect(page.getByText(copy.validation.errorCount(1))).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(Object.keys(bodies[0] as object).sort()).toEqual(['definition', 'mode']);

    await slugInput(page).fill(CV_PAGE_SLUG);
    await expect(validCheck(page)).toBeVisible();
  });

  test('a blocked validate request shows unavailable, never valid, and retry recovers', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await openBuilder(page);
    await importText(page, readSchema(CV_PAGE_FILE));
    await expect(validCheck(page)).toBeVisible();

    await page.route(VALIDATE_URL, (route) =>
      route.fulfill({ status: BLOCKED_STATUS, body: '{}' }),
    );
    await slugInput(page).fill(EDITED_SLUG);
    await expect(page.getByText(copy.validation.unavailable)).toBeVisible();
    await expect(validCheck(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.export.copy })).toBeDisabled();
    await expect(page.getByRole('button', { name: copy.export.download })).toBeDisabled();

    await page.unroute(VALIDATE_URL);
    await page.getByRole('button', { name: copy.validation.retry }).click();
    await expect(validCheck(page)).toBeVisible();
    await expect(page.getByRole('button', { name: copy.export.copy })).toBeEnabled();
  });

  test('export is off until the check of the current tree passes; copy puts the JSON on the clipboard', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInAsOwner(page);
    await openBuilder(page);
    await importText(page, readSchema(CV_PAGE_FILE));
    await expect(validCheck(page)).toBeVisible();

    const copyButton = page.getByRole('button', { name: copy.export.copy });
    await slugInput(page).fill(EDITED_SLUG);
    await expect(copyButton).toBeDisabled();
    await expect(page.getByText(copy.export.reason.checking)).toBeVisible();
    await expect(copyButton).toBeEnabled();
    await copyButton.click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect((JSON.parse(clipboard) as { slug: string }).slug).toBe(EDITED_SLUG);
    expect(clipboard.endsWith('\n')).toBe(true);
    await expect(page.getByText(copy.export.nextSteps.heading)).toBeVisible();
  });

  test('every schema file imports and downloads as the same JSON value, named <slug>.json', async ({
    page,
  }) => {
    test.setTimeout(schemaFiles.length * 30_000);
    await signInAsOwner(page);
    await openBuilder(page);
    for (const file of schemaFiles) {
      const original = readSchema(file);
      await importText(page, original);
      const download = page.getByRole('button', { name: copy.export.download });
      await expect(download).toBeEnabled();
      const [saved] = await Promise.all([page.waitForEvent('download'), download.click()]);
      expect(saved.suggestedFilename()).toBe(file);
      const path = await saved.path();
      const exported = readFileSync(path, 'utf8');
      expect(isDeepStrictEqual(JSON.parse(exported), JSON.parse(original)), file).toBe(true);
      expect(exported.endsWith('\n')).toBe(true);
      expect(exported.startsWith('{\n  "')).toBe(true);
      await expect(page.getByText(copy.export.nextSteps.heading)).toBeVisible();
    }
  });

  test('leave guard: asks with changes, stays or leaves; silent when clean or exported; beforeunload only with changes', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await openBuilder(page);
    await importText(page, readSchema(CV_PAGE_FILE));
    await expect(validCheck(page)).toBeVisible();
    const menu = page.getByRole('navigation', { name: nav.label });

    // Nothing changed: no dialog.
    await menu.getByRole('link', { name: nav.accounts }).click();
    await expect(page).toHaveURL(/\/accounts$/);
    await openBuilder(page);
    await importText(page, readSchema(CV_PAGE_FILE));

    await slugInput(page).fill(EDITED_SLUG);
    await menu.getByRole('link', { name: nav.accounts }).click();
    const dialog = page.getByRole('dialog', { name: leave.title });
    await dialog.getByRole('button', { name: leave.stay }).click();
    await expect(page).toHaveURL(/\/schema-builder$/);

    // Sign-out is guarded too, and still works after Leave.
    await chooseUserMenuItem(page, ADMIN_COPY.session.signOut);
    await dialog.getByRole('button', { name: leave.leave }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title }),
    ).toBeVisible();

    // Export clears the guard.
    await signInAsOwner(page);
    await openBuilder(page);
    await importText(page, readSchema(CV_PAGE_FILE));
    await slugInput(page).fill(EDITED_SLUG);
    const download = page.getByRole('button', { name: copy.export.download });
    await expect(download).toBeEnabled();
    await download.click();
    await expect(page.getByText(copy.export.nextSteps.heading)).toBeVisible();
    await chooseUserMenuItem(page, ADMIN_COPY.session.signOut);
    await expect(
      page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title }),
    ).toBeVisible();

    // Reload with changes raises the browser prompt.
    await signInAsOwner(page);
    await openBuilder(page);
    await importText(page, readSchema(CV_PAGE_FILE));
    await slugInput(page).fill(EDITED_SLUG);
    const prompt = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    expect((await prompt).type()).toBe('beforeunload');
    await (await prompt).dismiss();
  });

  test('markup in imported names shows as text only', async ({ page }) => {
    await signInAsOwner(page);
    await openBuilder(page);
    const markup = '<img src=x onerror="window.__xss=1">';
    const text = JSON.stringify({ slug: 'xss-test', displayName: markup, fields: [] });
    await importText(page, text);
    await expect(page.getByLabel(copy.typeKeys.displayName)).toHaveValue(markup);
    expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.locator('main img')).toHaveCount(0);
  });

  for (const viewport of [PHONE, DESKTOP]) {
    test(`no horizontal overflow at ${viewport.width}px with a loaded schema`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await signInAsOwner(page);
      await openBuilder(page);
      await importText(page, readSchema(CV_PAGE_FILE));
      await expect(validCheck(page)).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
});
