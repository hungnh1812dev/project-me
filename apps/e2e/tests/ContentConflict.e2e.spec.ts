import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type Request,
  test,
} from '@playwright/test';

import { ADMIN_COPY, contentNewPath } from '../src/Apps.contract';
import { e2eEnv } from '../src/E2e.env';
import { signInAs } from '../src/Session.fixture';
import { HTTP, RUN_ID, CV_PAGE_SLUG } from '../src/E2e.constants';
import { API_PATHS } from '../src/Api.endpoints';
import {
  contentSaveButton,
  fieldByLabel,
  listItem,
} from '../src/Locators.fixture';
import { inviteAccount } from '../src/Accounts.fixture';
import {
  limitEditorToPositionField,
  restoreEditorRole,
} from '../src/AccessPages.fixture';

const copy = ADMIN_COPY.content;
const merge = copy.conflict;
const list = copy.list;

const EDIT_URL = /\/content\/cv-page\/[0-9a-f-]{36}$/;
const DOCUMENTS_PATH = API_PATHS.documents(CV_PAGE_SLUG);
const SKILLS = ['Alpha', 'Beta', 'Gamma'].map((name) => `${name} ${RUN_ID}`);

const mergeDialog = (page: Page) =>
  page.getByRole('dialog', { name: merge.title });
const skillName = (page: Page, index: number) =>
  fieldByLabel(listItem(page, 'Skill', index), 'Skill');
const skillLevel = (page: Page, index: number) =>
  fieldByLabel(listItem(page, 'Skill', index), 'Level');
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
    contentSaveButton(page).click(),
  ]);
  return response;
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(fieldByLabel(page, 'Position')).toBeVisible();
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
    await signInAs(a, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('setup: a draft with three skills', async () => {
    await a.goto(contentNewPath(CV_PAGE_SLUG));
    await fieldByLabel(a, 'Position').fill(`Base ${RUN_ID}`);
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
    await fieldByLabel(b, 'Position').fill(`B1 ${RUN_ID}`);
    expect((await save(b)).ok()).toBe(true);

    await fieldByLabel(a, 'Position').fill(`A1 ${RUN_ID}`);
    const response = await save(a);
    expect(response.status()).toBe(HTTP.CONFLICT);
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
    await expect(fieldByLabel(a, 'Position')).toHaveValue(`A1 ${RUN_ID}`);
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
      await fieldByLabel(page, 'Position').fill(`B2 ${RUN_ID}`);
      await skillLevel(page, 1).fill('B-level');
    });
    await fieldByLabel(a, 'Position').fill(`A2 ${RUN_ID}`);
    await skillLevel(a, 0).fill('A-level');
    await a.getByRole('button', { name: list.remove('Skill', 1) }).click();
    await a.getByRole('button', { name: list.add('Skill') }).click();
    await skillName(a, 2).fill(`Delta ${RUN_ID}`);
    await a.getByRole('button', { name: list.moveUp('Skill', 1) }).click();
    expect((await save(a)).status()).toBe(HTTP.CONFLICT);

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
    await expect(fieldByLabel(a, 'Position')).toHaveValue(`B2 ${RUN_ID}`);
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
    expect((await save(a)).status()).toBe(HTTP.CONFLICT);

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
    await staleA((page) => fieldByLabel(page, 'Position').fill(`B3 ${RUN_ID}`));
    await fieldByLabel(a, 'Position').fill(`A3 ${RUN_ID}`);
    expect((await save(a)).status()).toBe(HTTP.CONFLICT);
    const dialog = mergeDialog(a);
    await dialog.getByRole('button', { name: merge.takeAllSaved }).click();
    await expect(
      card(dialog, 'Position').getByRole('radio', { name: merge.saved }),
    ).toBeChecked();
    const recorder = recordPuts(a);
    await dialog.getByRole('button', { name: merge.save }).click();
    await expect(dialog).toBeHidden();
    await expect(fieldByLabel(a, 'Position')).toHaveValue(`B3 ${RUN_ID}`);
    await expect(a.locator('[role="alert"]')).toHaveCount(0);
    recorder.stop();
    expect(recorder.puts).toHaveLength(0);
  });

  test('a second concurrent save during the merge refreshes the diff and resets choices', async () => {
    await staleA((page) => fieldByLabel(page, 'Position').fill(`B4 ${RUN_ID}`));
    await fieldByLabel(a, 'Position').fill(`A4 ${RUN_ID}`);
    await skillLevel(a, 0).fill('A4-level');
    const first = await save(a);
    expect(first.status()).toBe(HTTP.CONFLICT);
    const firstVersion = (
      (await first.json()) as { details: { currentVersion: number } }
    ).details.currentVersion;
    const dialog = mergeDialog(a);
    await choose(dialog, 'Skill 1 > Level', merge.saved);

    // Someone saves again while the modal is open.
    await open(b, editUrl);
    await fieldByLabel(b, 'Position').fill(`B5 ${RUN_ID}`);
    expect((await save(b)).ok()).toBe(true);

    const [second] = await Promise.all([
      a.waitForResponse(
        (r) =>
          r.url().includes(DOCUMENTS_PATH) && r.request().method() === 'PUT',
      ),
      dialog.getByRole('button', { name: merge.save }).click(),
    ]);
    expect(second.status()).toBe(HTTP.CONFLICT);
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
    await expect(fieldByLabel(a, 'Position')).toHaveValue(`A4 ${RUN_ID}`);
    await review.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: merge.cancel }).click();
    await expect(dialog).toBeHidden();
    // Reload drops the edits and the alert.
    await a.getByRole('button', { name: copy.errors.reload }).click();
    await expect(fieldByLabel(a, 'Position')).toHaveValue(`B5 ${RUN_ID}`);
    await expect(a.locator('[role="alert"]')).toHaveCount(0);
  });

  test('a conflict without readable rows (server null) shows only the reload alert', async () => {
    await a.route(`**${DOCUMENTS_PATH}/*`, async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      return route.fulfill({
        status: HTTP.CONFLICT,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: HTTP.CONFLICT,
          errorCode: 'DOCUMENT_VERSION_CONFLICT',
          message: 'conflict',
          details: { currentVersion: 99, server: null, submitted: null },
        }),
      });
    });
    await fieldByLabel(a, 'Position').fill(`A6 ${RUN_ID}`);
    await contentSaveButton(a).click();
    await expect(a.getByRole('alert')).toContainText(copy.errors.conflict);
    await expect(a.getByRole('dialog')).toHaveCount(0);
    await expect(
      a.getByRole('button', { name: copy.errors.reviewConflict }),
    ).toHaveCount(0);
    await a.unroute(`**${DOCUMENTS_PATH}/*`);
  });

  test.describe
    .serial('role with masked fields (Editor, cv-page reads Position only)', () => {
    const EDITOR_EMAIL = `e2e-masked-${RUN_ID}@domain.localhost`;
    const EDITOR_NAME = `Masked ${RUN_ID}`;
    const EDITOR_PASSWORD = `${e2eEnv.ownerPassword.slice(0, 40)}-masked`;
    const SECRET = `Secret company ${RUN_ID}`;
    const SECRET_NEWER = `Newer secret ${RUN_ID}`;
    let editorContext: BrowserContext;
    let editor: Page;
    let roleChanged = false;

    test.afterAll(async () => {
      await editorContext?.close();
      if (roleChanged) await restoreEditorRole(b);
    });

    test('setup: an Editor account and an Editor role that reads only Position', async ({
      browser,
    }) => {
      editor = await inviteAccount(
        b,
        browser,
        {
          email: EDITOR_EMAIL,
          name: EDITOR_NAME,
          role: 'Editor',
          password: EDITOR_PASSWORD,
        },
        (message) => consoleProblems.push(message),
      );
      editorContext = editor.context();

      roleChanged = true;
      await limitEditorToPositionField(b);

      await signInAs(editor, EDITOR_EMAIL, EDITOR_PASSWORD);
      await open(editor, editUrl);
      await expect(fieldByLabel(editor, 'Company')).toHaveCount(0);
    });

    test('a masked field never shows in the modal or the PUT, and keeps its value', async () => {
      await open(editor, editUrl);
      // The owner changes both Position and the masked Company.
      await open(b, editUrl);
      await fieldByLabel(b, 'Position').fill(`Owner ${RUN_ID}`);
      await fieldByLabel(b, 'Company').fill(SECRET);
      expect((await save(b)).ok()).toBe(true);

      await fieldByLabel(editor, 'Position').fill(`Editor ${RUN_ID}`);
      const response = await save(editor);
      expect(response.status()).toBe(HTTP.CONFLICT);
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
      await expect(fieldByLabel(editor, 'Position')).toHaveValue(
        `Editor ${RUN_ID}`,
      );

      // The owner still sees the untouched company.
      await open(b, editUrl);
      await expect(fieldByLabel(b, 'Company')).toHaveValue(SECRET);
      await expect(fieldByLabel(b, 'Position')).toHaveValue(`Editor ${RUN_ID}`);
    });

    test('only masked fields differ: no modal, just the reload alert', async () => {
      await open(editor, editUrl);
      await open(b, editUrl);
      await fieldByLabel(b, 'Company').fill(SECRET_NEWER);
      expect((await save(b)).ok()).toBe(true);

      const response = await save(editor);
      expect(response.status()).toBe(HTTP.CONFLICT);
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
