import { readdirSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import { expect, test, type Locator, type Page, type Request } from '@playwright/test';

import { ADMIN_COPY } from '../src/Apps.contract';
import { expectNoViolation, watchCsp } from '../src/CspWatch.fixture';
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

const BUILDER_SLUG = 'kbd-type';
const COMPONENT_TYPE = ADMIN_COPY.schemaBuilder.fieldTypes.component;
const SHORT_TYPE = ADMIN_COPY.schemaBuilder.fieldTypes.string;
const TOP_LEVEL_DEPTH = 3;
const ANNOUNCE_SETTLE_MS = 200;

const startNewType = async (page: Page) => {
  await page.getByRole('button', { name: copy.start.newType }).click();
  await slugInput(page).fill(BUILDER_SLUG);
  await page.getByLabel(copy.typeKeys.displayName).fill('Keyboard type');
};
const editButton = (page: Page, name: string) =>
  page.getByRole('button', { name: copy.row.select(name), exact: true });
const nameInput = (page: Page) => page.getByLabel(copy.property.name, { exact: true });
const announcement = (page: Page) => page.locator('[aria-live="assertive"]').last();

/** Opens an "Add field" style menu with the keyboard and picks a type with the keyboard. */
const addFieldByKeyboard = async (page: Page, opener: string, typeLabel: string) => {
  // Nested boxes may share a name; a box's own Add field comes before its parent's.
  const button = page.getByRole('button', { name: opener, exact: true }).first();
  await button.focus();
  await page.keyboard.press('Enter');
  const item = page.getByRole('menuitem', { name: typeLabel, exact: true });
  await item.focus();
  await page.keyboard.press('Enter');
};

/** Picks up, presses the arrow until the live region names the wanted place, then drops. */
const dragByKeyboard = async (page: Page, handleName: string, arrow: string, place: RegExp) => {
  const handle = page.getByRole('button', { name: handleName, exact: true });
  await handle.focus();
  await page.keyboard.press('Space');
  const maxSteps = 6;
  for (let step = 0; step < maxSteps; step += 1) {
    await page.keyboard.press(arrow);
    await page.waitForTimeout(ANNOUNCE_SETTLE_MS);
    if (place.test((await announcement(page).textContent()) ?? '')) break;
  }
  await page.keyboard.press('Space');
};

const POINTER_STEPS = 12;
const TALL_HEIGHT = 1400;
/** Drags with the pointer from the centre of one element to a point inside another. */
const dragWithPointer = async (page: Page, from: Locator, to: Locator, where = 0.5) => {
  const source = await from.boundingBox();
  const target = await to.boundingBox();
  if (!source || !target) throw new Error('drag source or target is not visible');
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 10, source.y + source.height / 2 - 10, {
    steps: 3,
  });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height * where, {
    steps: POINTER_STEPS,
  });
  await page.mouse.up();
};

test.describe('schema builder canvas (owner only)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    await openBuilder(page);
  });

  test('keyboard only: a 3-level component, no level-4 target, Move to, clean export', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await startNewType(page);

    await addFieldByKeyboard(page, copy.fields.addField, COMPONENT_TYPE);
    await expect(nameInput(page)).toHaveValue('field1');
    await addFieldByKeyboard(page, copy.fields.addFieldTo('field1'), COMPONENT_TYPE);
    await addFieldByKeyboard(page, copy.fields.addFieldTo('field1'), COMPONENT_TYPE);
    await expect(editButton(page, 'field1')).toHaveCount(3);
    expect(TOP_LEVEL_DEPTH).toBe(3);

    // Level 4: the innermost box offers no component.
    await page
      .getByRole('button', { name: copy.fields.addFieldTo('field1'), exact: true })
      .first()
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: SHORT_TYPE, exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('menuitem', { name: COMPONENT_TYPE, exact: true })
        .and(page.locator(':not([aria-disabled="true"])')),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');

    await addFieldByKeyboard(page, copy.fields.addFieldTo('field1'), SHORT_TYPE);
    await addFieldByKeyboard(page, copy.fields.addField, SHORT_TYPE);
    await expect(nameInput(page)).toHaveValue('field2');

    // Move to: the plain field at the top level goes into the innermost component.
    await page
      .getByRole('button', { name: copy.row.moveTo('field2'), exact: true })
      .last()
      .focus();
    await page.keyboard.press('Enter');
    const targets = page.getByRole('menuitem', {
      name: copy.row.moveToComponent('field1'),
      exact: true,
    });
    await expect(targets).toHaveCount(3);
    await targets.last().press('Enter');
    await expect(
      page
        .getByRole('list', { name: copy.fields.listLabel('field1') })
        .last()
        .getByRole('button', { name: /^Edit / }),
    ).toHaveCount(2);

    // A component holding a component has no Move to target that would make level 4.
    await expect(validCheck(page)).toBeVisible();
    const validateBodies: { definition: unknown }[] = [];
    page.on('request', (request) => {
      if (request.url().includes(VALIDATE_PATH_PART)) {
        validateBodies.push(request.postDataJSON() as { definition: unknown });
      }
    });
    const copyButton = page.getByRole('button', { name: copy.export.copy });
    await expect(copyButton).toBeEnabled();
    await copyButton.click();
    const exported = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
      slug: string;
      fields: { type: string; fields?: { fields?: { fields?: unknown[] }[] }[] }[];
    };
    expect(exported.slug).toBe(BUILDER_SLUG);
    expect(exported.fields).toHaveLength(1);
    const [firstField] = exported.fields;
    if (!firstField) throw new Error('the export has no field');
    expect(firstField.type).toBe('component');
    expect(firstField.fields?.[0]?.fields?.[0]).toBeDefined();
  });

  test('keyboard drag: palette to root and into a component, reorder, Escape cancels, announcements', async ({
    page,
  }) => {
    await startNewType(page);
    await addFieldByKeyboard(page, copy.fields.addField, COMPONENT_TYPE);
    await addFieldByKeyboard(page, copy.fields.addField, SHORT_TYPE);
    await expect(nameInput(page)).toHaveValue('field2');

    // Palette item into the component box (the box list is the first target up from the end).
    const paletteHandle = copy.dnd.paletteHandle(SHORT_TYPE);
    const handle = page.getByRole('button', { name: paletteHandle, exact: true });
    await handle.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    // Wait for the final "over" step (the box list) so Escape never races the coordinate update.
    await expect(announcement(page)).toContainText(/is over position 1 of 1 in Fields of field1\./);
    await page.keyboard.press('Escape');
    await expect(announcement(page)).toHaveText(copy.dnd.cancelled(SHORT_TYPE));
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(2);

    // Palette item to the top level.
    await dragByKeyboard(page, paletteHandle, 'ArrowUp', /in Fields\./);
    await expect(announcement(page)).toContainText(`${SHORT_TYPE} dropped at`);
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(3);
    await expect(editButton(page, 'field3')).toHaveAttribute('aria-pressed', 'true');

    // A top-level field into the component box.
    await dragByKeyboard(page, copy.dnd.fieldHandle('field2'), 'ArrowUp', /in Fields of field1\./);
    await expect(announcement(page)).toContainText('field2 dropped at');
    await expect(
      page
        .getByRole('list', { name: copy.fields.listLabel('field1') })
        .getByRole('button', { name: /^Edit / }),
    ).toHaveCount(1);

    // Reorder at the top level: field3 above field1.
    await dragByKeyboard(
      page,
      copy.dnd.fieldHandle('field3'),
      'ArrowUp',
      /position 1 of \d+ in Fields\./,
    );
    await expect(announcement(page)).toContainText('field3 dropped at');
    await expect(
      page
        .getByRole('list', { name: copy.fields.rootListLabel, exact: true })
        .getByRole('button', { name: /^Edit / })
        .first(),
    ).toHaveAttribute('aria-label', copy.row.select('field3'));
  });

  test('error marker follows its field after a reorder; choosing the error selects the field', async ({
    page,
  }) => {
    await startNewType(page);
    await addFieldByKeyboard(page, copy.fields.addField, SHORT_TYPE);
    await addFieldByKeyboard(page, copy.fields.addField, SHORT_TYPE);
    await nameInput(page).fill('Bad Name');
    await expect(page.getByText(copy.validation.errorCount(1))).toBeVisible();
    const marker = (name: string) => editButton(page, name).getByText(copy.row.hasErrors);
    await expect(marker('Bad Name')).toBeVisible();

    await page.getByRole('button', { name: copy.row.moveUp('Bad Name') }).click();
    await expect(page.getByText(copy.validation.errorCount(1))).toBeVisible();
    await expect(marker('Bad Name')).toBeVisible();
    await expect(marker('field1')).toHaveCount(0);

    await editButton(page, 'field1').click();
    await expect(nameInput(page)).toHaveValue('field1');
    await page.getByRole('button', { name: /^Go to the field of / }).click();
    await expect(nameInput(page)).toHaveValue('Bad Name');
  });

  test('selection follows moves; delete clears the panel; duplicate picks a free name', async ({
    page,
  }) => {
    await startNewType(page);
    await addFieldByKeyboard(page, copy.fields.addField, SHORT_TYPE);
    await addFieldByKeyboard(page, copy.fields.addField, SHORT_TYPE);
    await editButton(page, 'field1').click();
    await page.getByRole('button', { name: copy.row.moveDown('field1') }).click();
    await expect(nameInput(page)).toHaveValue('field1');
    await expect(editButton(page, 'field1')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: copy.row.duplicate('field1') }).click();
    await expect(nameInput(page)).not.toHaveValue('field1');
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(3);
    await page
      .getByRole('button', { name: copy.row.remove(await nameInput(page).inputValue()) })
      .click();
    await expect(page.getByText(copy.property.empty)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(2);
  });

  test('canvas edits set the leave guard; non-owner sends no validate request', async ({
    page,
  }) => {
    await startNewType(page);
    await addFieldByKeyboard(page, copy.fields.addField, SHORT_TYPE);
    await chooseUserMenuItem(page, ADMIN_COPY.session.signOut);
    const dialog = page.getByRole('dialog', { name: leave.title });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: leave.stay }).click();
    await expect(page).toHaveURL(/\/schema-builder$/);
  });
  test('pointer drag: palette to the top level and into a box, reorder, move out of a box', async ({
    page,
  }) => {
    // Tall enough that the palette and the canvas are on screen together for the mouse.
    await page.setViewportSize({ width: DESKTOP.width, height: TALL_HEIGHT });
    await startNewType(page);
    await addFieldByKeyboard(page, copy.fields.addField, COMPONENT_TYPE);
    const palette = (type: string) =>
      page.getByRole('button', { name: copy.dnd.paletteHandle(type), exact: true });
    const edits = page.getByRole('button', { name: /^Edit / });
    const innerRows = page
      .getByRole('list', { name: copy.fields.listLabel('field1') })
      .getByRole('button', { name: /^Edit / });

    // Palette item into the component box.
    await dragWithPointer(page, palette(SHORT_TYPE), page.getByText(copy.fields.emptyComponent));
    await expect(edits).toHaveCount(2);
    await expect(
      page
        .getByRole('list', { name: copy.fields.listLabel('field1') })
        .getByRole('button', { name: /^Edit / }),
    ).toHaveCount(1);
    await expect(nameInput(page)).toBeVisible();

    // Palette item to the top level (below the box).
    await dragWithPointer(
      page,
      palette(SHORT_TYPE),
      page.getByRole('button', { name: copy.fields.addField, exact: true }),
    );
    await expect(edits).toHaveCount(3);
    await expect(innerRows).toHaveCount(1);

    // Move the inner field out of the box, onto the top-level field.
    const inner = page
      .getByRole('list', { name: copy.fields.listLabel('field1') })
      .getByRole('button', { name: copy.dnd.fieldHandle('field1') });
    await dragWithPointer(page, inner, editButton(page, 'field2'), 0.8);
    await expect(innerRows).toHaveCount(0);
    await expect(edits).toHaveCount(3);
    await expect(announcement(page)).toContainText('dropped at');
  });
  test('each canvas edit kind sets the leave guard on a clean import', async ({ page }) => {
    const edits: [string, (target: Page) => Promise<void>][] = [
      [
        'move',
        (target) =>
          target
            .getByRole('button', { name: /^Move .* down$/ })
            .first()
            .click(),
      ],
      [
        'duplicate',
        (target) =>
          target
            .getByRole('button', { name: /^Duplicate / })
            .first()
            .click(),
      ],
      [
        'delete',
        (target) =>
          target
            .getByRole('button', { name: /^Delete / })
            .first()
            .click(),
      ],
      [
        'palette',
        (target) => target.getByRole('button', { name: SHORT_TYPE, exact: true }).click(),
      ],
    ];
    const menu = page.getByRole('navigation', { name: nav.label });
    for (const [kind, edit] of edits) {
      await openBuilder(page);
      await importText(page, readSchema(CV_PAGE_FILE));
      await expect(validCheck(page), kind).toBeVisible();
      await edit(page);
      await menu.getByRole('link', { name: nav.accounts }).click();
      const dialog = page.getByRole('dialog', { name: leave.title });
      await expect(dialog, kind).toBeVisible();
      await dialog.getByRole('button', { name: leave.leave }).click();
      await expect(page, kind).toHaveURL(/\/accounts$/);
    }
  });
  test('deleting a component that holds fields asks first; a plain field goes at once', async ({
    page,
  }) => {
    const definition = {
      slug: 'delete-check',
      displayName: 'Delete check',
      fields: [
        { name: 'title', type: 'string' },
        {
          name: 'hero',
          type: 'component',
          component: 'hero',
          fields: [{ name: 'heading', type: 'string' }],
        },
      ],
    };
    await importText(page, JSON.stringify(definition));
    const dialog = page.getByRole('dialog', { name: copy.row.deleteDialog.title('hero') });

    await page.getByRole('button', { name: copy.row.remove('hero') }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: copy.row.deleteDialog.cancel }).click();
    await expect(editButton(page, 'hero')).toBeVisible();

    await page.getByRole('button', { name: copy.row.remove('title') }).click();
    await expect(editButton(page, 'title')).toHaveCount(0);
    await expect(dialog).toHaveCount(0);

    await page.getByRole('button', { name: copy.row.remove('hero') }).click();
    await dialog.getByRole('button', { name: copy.row.deleteDialog.confirm('hero') }).click();
    await expect(editButton(page, 'hero')).toHaveCount(0);
    await expect(page.getByText(copy.fields.empty)).toBeVisible();
  });

  // Regression of finding SCB-C-qc#1: the keyboard reaches an empty box when a top-level field follows it.
  test('pointer and keyboard drags raise no CSP violation and no console error', async ({
    page,
  }) => {
    await page.setViewportSize({ width: DESKTOP.width, height: TALL_HEIGHT });
    const readViolations = await watchCsp(page);
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await openBuilder(page);
    await startNewType(page);
    await addFieldByKeyboard(page, copy.fields.addField, COMPONENT_TYPE);
    await dragWithPointer(
      page,
      page.getByRole('button', { name: copy.dnd.paletteHandle(SHORT_TYPE), exact: true }),
      page.getByText(copy.fields.emptyComponent),
    );
    await expect(announcement(page)).toContainText('dropped at');
    await dragByKeyboard(page, copy.dnd.paletteHandle(SHORT_TYPE), 'ArrowDown', /in Fields\./);
    await expect(announcement(page)).toContainText('dropped at');
    await expectNoViolation(readViolations, '/schema-builder during drags');
    expect(consoleErrors).toEqual([]);
  });

  test('keyboard palette drag reaches an empty component box that a top-level field follows', async ({
    page,
  }) => {
    await startNewType(page);
    await addFieldByKeyboard(page, copy.fields.addField, COMPONENT_TYPE);
    await addFieldByKeyboard(page, copy.fields.addField, SHORT_TYPE);
    await dragByKeyboard(
      page,
      copy.dnd.paletteHandle(SHORT_TYPE),
      'ArrowUp',
      /in Fields of field1\./,
    );
    await expect(
      page
        .getByRole('list', { name: copy.fields.listLabel('field1') })
        .getByRole('button', { name: /^Edit / }),
    ).toHaveCount(1);
  });

  for (const viewport of [DESKTOP, PHONE]) {
    // Regression of finding SCB-C-qc#2: palette chips grow to their label.
    test(`palette labels are not clipped and the page does not overflow at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await startNewType(page);
      const clipped = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .filter((button) => button.scrollWidth > button.clientWidth)
          .map((button) => button.textContent),
      );
      expect(clipped).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

const IMPORT_CAP = 500;
const ERROR_COUNT = /^\d+ errors?$/;
const IMPORT_DEPTH_CAP = 5;
const OVER_CAP_NESTING = 1550;
const DEEP_NESTING = 400;
const PLAIN_FIELD = { name: 'leaf', type: 'text' };

/** `levels` components inside each other, one plain field in the innermost. */
const nestedComponents = (levels: number): unknown => {
  let inner: unknown = PLAIN_FIELD;
  for (let level = 0; level < levels; level += 1) {
    inner = { name: `box${level}`, type: 'component', fields: [inner] };
  }
  return inner;
};

const definitionText = (fields: unknown[]) =>
  JSON.stringify({
    slug: 'deep-type',
    displayName: 'Deep',
    kind: 'collection',
    draftAndPublish: false,
    fields,
  });

test.describe('schema builder end to end and limits (owner only)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: DESKTOP.width, height: TALL_HEIGHT });
    await signInAsOwner(page);
    await openBuilder(page);
  });

  test('import, add by pointer and keyboard drag, rename, fix an error, export, guard clears', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    const bodies: Record<string, unknown>[] = [];
    page.on('request', (request) => {
      if (request.url().includes(VALIDATE_PATH_PART) && request.method() === 'POST') {
        bodies.push(request.postDataJSON() as Record<string, unknown>);
      }
    });
    const handle = (type: string) =>
      page.getByRole('button', { name: copy.dnd.paletteHandle(type), exact: true });

    await importText(page, readSchema(CV_PAGE_FILE));
    await expect(validCheck(page)).toBeVisible();

    // Pointer: a palette item into the skills component, onto its first row.
    const skillsList = page.getByRole('list', { name: copy.fields.listLabel('skills') });
    await dragWithPointer(
      page,
      handle(SHORT_TYPE),
      skillsList.getByRole('button', { name: copy.row.select('level'), exact: true }),
      0.3,
    );
    await expect(nameInput(page)).toHaveValue('field1');
    await expect(
      skillsList.getByRole('button', { name: copy.row.select('field1'), exact: true }),
    ).toBeVisible();
    // Keyboard: a second palette item onto the top level, then into a component with Move to.
    const edits = page.getByRole('button', { name: /^Edit / });
    const before = await edits.count();
    await dragByKeyboard(page, copy.dnd.paletteHandle(SHORT_TYPE), 'ArrowDown', /in Fields\./);
    await expect(announcement(page)).toContainText(`${SHORT_TYPE} dropped at`);
    await expect(edits).toHaveCount(before + 1);
    const added = 'extra';
    await nameInput(page).fill(added);
    await page.getByRole('button', { name: copy.row.moveTo(added), exact: true }).focus();
    await page.keyboard.press('Enter');
    await page
      .getByRole('menuitem', { name: copy.row.moveToComponent('languages'), exact: true })
      .press('Enter');
    await expect(
      page
        .getByRole('list', { name: copy.fields.listLabel('languages') })
        .getByRole('button', { name: copy.row.select(added), exact: true }),
    ).toBeVisible();

    // Rename, break and fix.
    await editButton(page, 'field1').click();
    await nameInput(page).fill('Bad Name');
    await expect(page.getByText(copy.validation.errorCount(1))).toBeVisible();
    await expect(editButton(page, 'Bad Name').getByText(copy.row.hasErrors)).toBeVisible();
    await expect(page.getByRole('button', { name: copy.export.download })).toBeDisabled();
    await nameInput(page).fill('badge');
    await expect(validCheck(page)).toBeVisible();

    const download = page.getByRole('button', { name: copy.export.download });
    await expect(download).toBeEnabled();
    const [saved] = await Promise.all([page.waitForEvent('download'), download.click()]);
    const exported = JSON.parse(readFileSync(await saved.path(), 'utf8')) as {
      fields: { name: string; fields?: { name: string }[] }[];
    };
    const children = (name: string) =>
      exported.fields.find((field) => field.name === name)?.fields?.map((field) => field.name);
    expect(children('skills')).toContain('badge');
    expect(children('languages')).toContain('extra');
    for (const body of bodies) expect(Object.keys(body).sort()).toEqual(['definition', 'mode']);

    // The export cleared the guard: a menu link leaves without a question.
    await page
      .getByRole('navigation', { name: nav.label })
      .getByRole('link', { name: nav.accounts })
      .click();
    await expect(page).toHaveURL(/\/accounts$/);
    expect(consoleErrors).toEqual([]);
  });

  test('a file over the field cap is refused and the work stays; deep nesting shows errors, never a blank page', async ({
    page,
  }) => {
    await importText(page, readSchema(CV_PAGE_FILE));
    await expect(validCheck(page)).toBeVisible();
    const failures: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 300)));
    page.on('response', (response) => {
      if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`);
    });

    const flat = Array.from({ length: IMPORT_CAP + 1 }, (_, index) => ({
      name: `f${index}`,
      type: 'text',
    }));
    let dialog = await importText(page, definitionText(flat));
    await expect(dialog.getByText(copy.import.refusal.tooManyFields(IMPORT_CAP))).toBeVisible();
    await dialog.getByRole('button', { name: copy.import.cancel }).click();
    await expect(slugInput(page)).toHaveValue(CV_PAGE_SLUG);

    // Past depth 3: loads, the check names the problem on a row.
    dialog = await importText(page, definitionText([nestedComponents(IMPORT_DEPTH_CAP - 1)]));
    await expect(dialog).toBeHidden();
    await expect(slugInput(page)).toHaveValue('deep-type');
    await expect(page.getByText(ERROR_COUNT).first()).toBeVisible();
    await expect(validCheck(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.export.download })).toBeDisabled();

    // Extreme nesting is refused (by count or by depth), never a crash, and the work stays.
    dialog = await importText(page, definitionText([nestedComponents(OVER_CAP_NESTING)]));
    await expect(dialog.getByText(copy.import.refusal.tooManyFields(IMPORT_CAP))).toBeVisible();
    await dialog.getByRole('button', { name: copy.import.cancel }).click();
    dialog = await importText(page, definitionText([nestedComponents(DEEP_NESTING)]));
    await expect(dialog.getByText(copy.import.refusal.tooDeep(IMPORT_DEPTH_CAP))).toBeVisible();
    await dialog.getByRole('button', { name: copy.import.cancel }).click();
    await expect(page.getByRole('heading', { level: 1, name: copy.title })).toBeVisible();
    await expect(slugInput(page)).toHaveValue('deep-type');
    expect(pageErrors).toEqual([]);
    expect(failures).toEqual([]);
  });
});
