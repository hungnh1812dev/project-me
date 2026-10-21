import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type Request,
  test,
} from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import { contentNewPath } from '../../cms-admin/src/config/routes';
import { e2eEnv } from '../src/env';
import { mailIdsFor, waitForCode } from '../src/mailpit';

const copy = COPY.content;
const merge = copy.conflict;
const list = copy.list;

const CV_SLUG = 'cv-page';
const EDIT_URL = /\/content\/cv-page\/[0-9a-f-]{36}$/;
const RUN_ID = Date.now().toString(36);
const DOCUMENTS_PATH = `/documents/${CV_SLUG}`;
const HTTP_CONFLICT = 409;
const SKILLS = ['Alpha', 'Beta', 'Gamma'].map((name) => `${name} ${RUN_ID}`);

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: COPY.login.emailLabel }).fill(email);
  await page.getByLabel(COPY.login.passwordLabel).fill(password);
  await page.getByRole('button', { name: COPY.login.submit }).click();
  await expect(
    page.getByRole('button', { name: COPY.session.signOut }),
  ).toBeVisible();
}

const field = (scope: Page | Locator, label: string) =>
  scope.getByLabel(label, { exact: true });
const saveButton = (page: Page) =>
  page.getByRole('button', { name: copy.save, exact: true });
const mergeDialog = (page: Page) =>
  page.getByRole('dialog', { name: merge.title });
const pageOf = (scope: Page | Locator): Page =>
  'page' in scope && typeof scope.page === 'function'
    ? scope.page()
    : (scope as Page);
const item = (scope: Page | Locator, label: string, index: number) =>
  scope
    .getByRole('listitem')
    .filter({
      has: pageOf(scope).getByRole('heading', {
        name: list.itemTitle(label, index),
        exact: true,
      }),
    })
    .first();
const skillName = (page: Page, index: number) =>
  field(item(page, 'Skill', index), 'Skill');
const skillLevel = (page: Page, index: number) =>
  field(item(page, 'Skill', index), 'Level');
/** One difference card: a fieldset named after what differs. */
const card = (dialog: Locator, title: string) =>
  dialog.getByRole('group', { name: title, exact: true });
const choose = (
  dialog: Locator,
  title: string,
  side: typeof merge.saved | typeof merge.mine,
) => card(dialog, title).getByRole('radio', { name: side }).check();

const isWrite = (request: Request) =>
  request.url().includes(DOCUMENTS_PATH) && request.method() === 'PUT';
const bodyOf = (request: Request) =>
  JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;

function recordPuts(page: Page) {
  const puts: Request[] = [];
  const onRequest = (request: Request) => {
    if (isWrite(request)) puts.push(request);
  };
  page.on('request', onRequest);
  return { puts, stop: () => page.off('request', onRequest) };
}

/** Saves and waits for the PUT to finish (any status). */
async function save(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(DOCUMENTS_PATH) && r.request().method() === 'PUT',
    ),
    saveButton(page).click(),
  ]);
  return response;
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(field(page, 'Position')).toBeVisible();
}

test.describe.serial('owner: conflict merge modal (cv-page)', () => {
  let context: BrowserContext;
  let a: Page;
  let b: Page;
  let editUrl = '';
  const consoleProblems: string[] = [];

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    a = await context.newPage();
    b = await context.newPage();
    for (const p of [a, b]) {
      p.on('console', (message) => {
        if (message.type() === 'error') consoleProblems.push(message.text());
      });
      p.on('pageerror', (error) => consoleProblems.push(error.message));
    }
    await signIn(a, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('setup: a draft with three skills', async () => {
    await a.goto(contentNewPath(CV_SLUG));
    await field(a, 'Position').fill(`Base ${RUN_ID}`);
    for (const [index, name] of SKILLS.entries()) {
      await a.getByRole('button', { name: list.add('Skill') }).click();
      await skillName(a, index).fill(name);
      await skillLevel(a, index).fill('Basic');
    }
    await a.keyboard.press('Enter');
    await expect(a).toHaveURL(EDIT_URL);
    editUrl = a.url();
  });

  test('keep mine: modal lists the difference, default is Your version, PUT carries the new version', async () => {
    await open(b, editUrl);
    await open(a, editUrl);
    await field(b, 'Position').fill(`B1 ${RUN_ID}`);
    expect((await save(b)).ok()).toBe(true);

    await field(a, 'Position').fill(`A1 ${RUN_ID}`);
    const response = await save(a);
    expect(response.status()).toBe(HTTP_CONFLICT);
    const conflict = (await response.json()) as {
      details: { currentVersion: number };
    };

    const dialog = mergeDialog(a);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(merge.summary(1));
    // The alert stays behind the modal.
    await expect(a.locator('[role="alert"]')).toHaveCount(1);
    const position = card(dialog, 'Position');
    await expect(position).toContainText(`B1 ${RUN_ID}`);
    await expect(position).toContainText(`A1 ${RUN_ID}`);
    await expect(
      position.getByRole('radio', { name: merge.mine }),
    ).toBeChecked();

    const recorder = recordPuts(a);
    await dialog.getByRole('button', { name: merge.save }).click();
    await expect(dialog).toBeHidden();
    await expect(a.getByText(copy.saved)).toBeVisible();
    recorder.stop();
    expect(recorder.puts).toHaveLength(1);
    const body = bodyOf(recorder.puts[0] as Request);
    expect(body['version']).toBe(conflict.details.currentVersion);
    expect(JSON.stringify(body['values'])).toContain(`A1 ${RUN_ID}`);
    await expect(field(a, 'Position')).toHaveValue(`A1 ${RUN_ID}`);
    await expect(a.locator('[role="alert"]')).toHaveCount(0);
  });

  /** The card of the one difference of this kind ("Removed", "Added", ...). */
  const cardOf = (dialog: Locator, change: string) =>
    dialog.getByRole('group').filter({ hasText: change });
  const pick = (dialog: Locator, change: string, side: string) =>
    cardOf(dialog, change).getByRole('radio', { name: side }).check();

  const skillNames = async (page: Page) =>
    page
      .getByRole('region', { name: 'Skill', exact: true })
      .getByLabel('Skill', { exact: true })
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      );

  /** Both pages show the latest version; b saves `edit`, then a is stale. */
  async function staleA(edit: (page: Page) => Promise<void>) {
    await open(b, editUrl);
    await open(a, editUrl);
    await edit(b);
    expect((await save(b)).ok()).toBe(true);
  }

  test('item cases: removed, added, level and reorder each take either side', async () => {
    await staleA(async (page) => {
      await field(page, 'Position').fill(`B2 ${RUN_ID}`);
      await skillLevel(page, 1).fill('B-level');
    });
    await field(a, 'Position').fill(`A2 ${RUN_ID}`);
    await skillLevel(a, 0).fill('A-level');
    await a.getByRole('button', { name: list.remove('Skill', 1) }).click();
    await a.getByRole('button', { name: list.add('Skill') }).click();
    await skillName(a, 2).fill(`Delta ${RUN_ID}`);
    await a.getByRole('button', { name: list.moveUp('Skill', 1) }).click();
    expect((await save(a)).status()).toBe(HTTP_CONFLICT);

    const dialog = mergeDialog(a);
    await expect(dialog).toContainText(merge.summary(5));
    for (const change of Object.values(merge.change)) {
      await expect(cardOf(dialog, change).first()).toBeVisible();
    }
    // Position and the order take the saved side; the removal of Beta is
    // refused (Beta stays with B's level); the level edit and the new
    // item are kept.
    await choose(dialog, 'Position', merge.saved);
    await pick(dialog, merge.change.removed, merge.saved);
    await pick(dialog, merge.change.moved, merge.saved);
    await expect(
      cardOf(dialog, merge.change.added).getByRole('radio', {
        name: merge.mine,
      }),
    ).toBeChecked();

    await dialog.getByRole('button', { name: merge.save }).click();
    await expect(dialog).toBeHidden();
    await expect(a.getByText(copy.saved)).toBeVisible();
    await expect(field(a, 'Position')).toHaveValue(`B2 ${RUN_ID}`);
    expect(await skillNames(a)).toEqual([
      SKILLS[0],
      SKILLS[1],
      SKILLS[2],
      `Delta ${RUN_ID}`,
    ]);
    await expect(skillLevel(a, 0)).toHaveValue('A-level');
    await expect(skillLevel(a, 1)).toHaveValue('B-level');
  });

  test('item cases, other side: own removal, saved add, own order', async () => {
    await staleA((page) => skillLevel(page, 2).fill('B-gamma'));
    await a.getByRole('button', { name: list.remove('Skill', 2) }).click();
    await a.getByRole('button', { name: list.add('Skill') }).click();
    await skillName(a, 3).fill(`Eps ${RUN_ID}`);
    await a.getByRole('button', { name: list.moveUp('Skill', 1) }).click();
    expect((await save(a)).status()).toBe(HTTP_CONFLICT);

    const dialog = mergeDialog(a);
    await pick(dialog, merge.change.added, merge.saved);
    await expect(
      cardOf(dialog, merge.change.removed).getByRole('radio', {
        name: merge.mine,
      }),
    ).toBeChecked();
    await dialog.getByRole('button', { name: merge.save }).click();
    await expect(dialog).toBeHidden();
    expect(await skillNames(a)).toEqual([
      SKILLS[1],
      SKILLS[0],
      `Delta ${RUN_ID}`,
    ]);
  });

  test('all saved: no PUT, the form reloads to the saved version', async () => {
    await staleA((page) => field(page, 'Position').fill(`B3 ${RUN_ID}`));
    await field(a, 'Position').fill(`A3 ${RUN_ID}`);
    expect((await save(a)).status()).toBe(HTTP_CONFLICT);
    const dialog = mergeDialog(a);
    await dialog.getByRole('button', { name: merge.takeAllSaved }).click();
    await expect(
      card(dialog, 'Position').getByRole('radio', { name: merge.saved }),
    ).toBeChecked();
    const recorder = recordPuts(a);
    await dialog.getByRole('button', { name: merge.save }).click();
    await expect(dialog).toBeHidden();
    await expect(field(a, 'Position')).toHaveValue(`B3 ${RUN_ID}`);
    await expect(a.locator('[role="alert"]')).toHaveCount(0);
    recorder.stop();
    expect(recorder.puts).toHaveLength(0);
  });

  test('a second concurrent save during the merge refreshes the diff and resets choices', async () => {
    await staleA((page) => field(page, 'Position').fill(`B4 ${RUN_ID}`));
    await field(a, 'Position').fill(`A4 ${RUN_ID}`);
    await skillLevel(a, 0).fill('A4-level');
    const first = await save(a);
    expect(first.status()).toBe(HTTP_CONFLICT);
    const firstVersion = (
      (await first.json()) as { details: { currentVersion: number } }
    ).details.currentVersion;
    const dialog = mergeDialog(a);
    await choose(dialog, 'Skill 1 > Level', merge.saved);

    // Someone saves again while the modal is open.
    await open(b, editUrl);
    await field(b, 'Position').fill(`B5 ${RUN_ID}`);
    expect((await save(b)).ok()).toBe(true);

    const [second] = await Promise.all([
      a.waitForResponse(
        (r) =>
          r.url().includes(DOCUMENTS_PATH) && r.request().method() === 'PUT',
      ),
      dialog.getByRole('button', { name: merge.save }).click(),
    ]);
    expect(second.status()).toBe(HTTP_CONFLICT);
    const secondVersion = (
      (await second.json()) as { details: { currentVersion: number } }
    ).details.currentVersion;
    expect(secondVersion).toBeGreaterThan(firstVersion);
    await expect(dialog).toBeVisible();
    // Only what the resubmit carried is compared against the new version.
    await expect(dialog).toContainText(merge.summary(1));
    const position = card(dialog, 'Position');
    await expect(position).toContainText(`B5 ${RUN_ID}`);
    await expect(
      position.getByRole('radio', { name: merge.mine }),
    ).toBeChecked();
  });

  test('keyboard and closing: radios are reachable, Esc closes, Review reopens, Cancel closes', async () => {
    const dialog = mergeDialog(a);
    const position = card(dialog, 'Position');
    const mine = position.getByRole('radio', { name: merge.mine });
    const saved = position.getByRole('radio', { name: merge.saved });
    await mine.focus();
    await expect(mine).toBeFocused();
    await a.keyboard.press('ArrowUp');
    await expect(saved).toBeFocused();
    await expect(saved).toBeChecked();
    await a.keyboard.press('ArrowDown');
    await expect(mine).toBeChecked();

    await a.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const review = a.getByRole('button', { name: copy.errors.reviewConflict });
    await expect(a.getByRole('alert')).toContainText(copy.errors.conflict);
    await expect(review).toBeVisible();
    await expect(field(a, 'Position')).toHaveValue(`A4 ${RUN_ID}`);
    await review.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: merge.cancel }).click();
    await expect(dialog).toBeHidden();
    // Reload drops the edits and the alert.
    await a.getByRole('button', { name: copy.errors.reload }).click();
    await expect(field(a, 'Position')).toHaveValue(`B5 ${RUN_ID}`);
    await expect(a.locator('[role="alert"]')).toHaveCount(0);
  });

  test('a conflict without readable rows (server null) shows only the reload alert', async () => {
    await a.route(`**${DOCUMENTS_PATH}/*`, async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      return route.fulfill({
        status: HTTP_CONFLICT,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: HTTP_CONFLICT,
          errorCode: 'DOCUMENT_VERSION_CONFLICT',
          message: 'conflict',
          details: { currentVersion: 99, server: null, submitted: null },
        }),
      });
    });
    await field(a, 'Position').fill(`A6 ${RUN_ID}`);
    await saveButton(a).click();
    await expect(a.getByRole('alert')).toContainText(copy.errors.conflict);
    await expect(a.getByRole('dialog')).toHaveCount(0);
    await expect(
      a.getByRole('button', { name: copy.errors.reviewConflict }),
    ).toHaveCount(0);
    await a.unroute(`**${DOCUMENTS_PATH}/*`);
  });

  test.describe
    .serial('role with masked fields (Editor, cv-page reads Position only)', () => {
    const access = COPY.access;
    const EDITOR_EMAIL = `e2e-masked-${RUN_ID}@domain.localhost`;
    const EDITOR_NAME = `Masked ${RUN_ID}`;
    const EDITOR_PASSWORD = `${e2eEnv.ownerPassword.slice(0, 40)}-masked`;
    const SECRET = `Secret company ${RUN_ID}`;
    const SECRET_NEWER = `Newer secret ${RUN_ID}`;
    const label = (name: string) => new RegExp(`^${name}`);
    let editorContext: BrowserContext;
    let editor: Page;
    let roleChanged = false;

    const roleCell = (page: Page) =>
      page.getByRole('checkbox', {
        name: access.matrix.cellLabel(access.matrix.actions.read, CV_SLUG),
        exact: true,
      });
    const rolesSave = (page: Page) =>
      page.getByRole('button', { name: access.role.save });

    async function openEditorRole(page: Page) {
      await page.goto('/roles');
      await page
        .getByRole('link', { name: access.roles.open('Editor') })
        .click();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Editor' }),
      ).toBeVisible();
    }

    test.afterAll(async () => {
      await editorContext?.close();
      if (!roleChanged) return;
      // Put the shared Editor role back for the other specs.
      await openEditorRole(b);
      await roleCell(b).uncheck();
      await rolesSave(b).click();
      await expect(b.getByRole('status')).toBeVisible();
    });

    test('setup: an Editor account and an Editor role that reads only Position', async ({
      browser,
    }) => {
      await b.goto('/accounts');
      const seen = await mailIdsFor(context, EDITOR_EMAIL);
      await b.getByRole('button', { name: access.accounts.invite }).click();
      const dialog = b.getByRole('dialog', { name: access.invite.title });
      await dialog
        .getByLabel(label(access.invite.emailLabel))
        .fill(EDITOR_EMAIL);
      await dialog
        .getByLabel(label(access.invite.displayNameLabel))
        .fill(EDITOR_NAME);
      await dialog
        .getByLabel(label(access.invite.roleLabel))
        .selectOption('Editor');
      await dialog.getByRole('button', { name: access.invite.submit }).click();
      await expect(dialog).toBeHidden();
      const code = await waitForCode(context, EDITOR_EMAIL, seen);

      editorContext = await browser.newContext();
      editor = await editorContext.newPage();
      editor.on('pageerror', (error) => consoleProblems.push(error.message));
      await editor.goto('/set-password');
      await editor
        .getByLabel(label(COPY.password.emailLabel))
        .fill(EDITOR_EMAIL);
      await editor.getByLabel(label(COPY.password.codeLabel)).fill(code);
      await editor
        .getByLabel(label(COPY.password.newPasswordLabel))
        .fill(EDITOR_PASSWORD);
      await editor
        .getByLabel(label(COPY.password.confirmPasswordLabel))
        .fill(EDITOR_PASSWORD);
      await editor
        .getByRole('button', { name: COPY.password.set.submit })
        .click();
      await expect(editor.getByRole('status')).toHaveText(
        COPY.login.notices.passwordSet,
      );

      await openEditorRole(b);
      await roleCell(b).check();
      await b
        .getByRole('button', {
          name: access.matrix.detailsLabel(CV_SLUG),
        })
        .click();
      await b.getByRole('radio', { name: access.fields.some }).check();
      await b
        .getByRole('group', { name: access.fields.readable })
        .getByRole('checkbox', { name: 'position', exact: true })
        .check();
      roleChanged = true;
      await rolesSave(b).click();
      await expect(b.getByRole('status')).toContainText('Permissions saved');

      await signIn(editor, EDITOR_EMAIL, EDITOR_PASSWORD);
      await open(editor, editUrl);
      await expect(field(editor, 'Company')).toHaveCount(0);
    });

    test('a masked field never shows in the modal or the PUT, and keeps its value', async () => {
      await open(editor, editUrl);
      // The owner changes both Position and the masked Company.
      await open(b, editUrl);
      await field(b, 'Position').fill(`Owner ${RUN_ID}`);
      await field(b, 'Company').fill(SECRET);
      expect((await save(b)).ok()).toBe(true);

      await field(editor, 'Position').fill(`Editor ${RUN_ID}`);
      const response = await save(editor);
      expect(response.status()).toBe(HTTP_CONFLICT);
      const dialog = mergeDialog(editor);
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(merge.summary(1));
      await expect(card(dialog, 'Position')).toContainText(`Owner ${RUN_ID}`);
      await expect(dialog).not.toContainText('Company');
      await expect(dialog).not.toContainText(SECRET);
      expect(await editor.content()).not.toContain(SECRET);

      const recorder = recordPuts(editor);
      await dialog.getByRole('button', { name: merge.save }).click();
      await expect(dialog).toBeHidden();
      await expect(editor.getByText(copy.saved)).toBeVisible();
      recorder.stop();
      const sent = JSON.stringify(bodyOf(recorder.puts[0] as Request));
      expect(sent).toContain(`Editor ${RUN_ID}`);
      expect(sent).not.toContain('company');
      expect(sent).not.toContain(SECRET);
      expect(sent).not.toContain('***');
      await expect(field(editor, 'Position')).toHaveValue(`Editor ${RUN_ID}`);

      // The owner still sees the untouched company.
      await open(b, editUrl);
      await expect(field(b, 'Company')).toHaveValue(SECRET);
      await expect(field(b, 'Position')).toHaveValue(`Editor ${RUN_ID}`);
    });

    test('only masked fields differ: no modal, just the reload alert', async () => {
      await open(editor, editUrl);
      await open(b, editUrl);
      await field(b, 'Company').fill(SECRET_NEWER);
      expect((await save(b)).ok()).toBe(true);

      const response = await save(editor);
      expect(response.status()).toBe(HTTP_CONFLICT);
      await expect(editor.getByRole('alert')).toContainText(
        copy.errors.conflict,
      );
      await expect(editor.getByRole('dialog')).toHaveCount(0);
      await expect(
        editor.getByRole('button', { name: copy.errors.reviewConflict }),
      ).toHaveCount(0);
      expect(await editor.content()).not.toContain(SECRET_NEWER);
    });
  });

  test('the console stayed free of unexpected errors', () => {
    const unexpected = consoleProblems.filter(
      (text) => !text.includes('Failed to load resource'),
    );
    expect(unexpected).toEqual([]);
  });
});
