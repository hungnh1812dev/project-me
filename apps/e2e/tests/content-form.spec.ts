import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type Request,
  test,
} from '@playwright/test';

import { API_ERROR_CODES } from '../../cms-admin/src/config/http.constants';
import { COPY } from '../../cms-admin/src/config/copy.constants';
import { contentNewPath } from '../../cms-admin/src/config/routes';
import { e2eEnv } from '../src/env';

const copy = COPY.content;
const list = copy.list;

const CV_SLUG = 'cv-page';
const EDIT_URL = /\/content\/cv-page\/[0-9a-f-]{36}$/;
const NOT_JSON = 'not json';
const TEAM_SIZE_DECIMAL = '4.5';
const RUN_ID = Date.now().toString(36);
const POSITION = `E2E position ${RUN_ID}`;
const POSITION_EDITED = `E2E position edited ${RUN_ID}`;
const SKILL_NAMES = [`Alpha ${RUN_ID}`, `Beta ${RUN_ID}`, `Gamma ${RUN_ID}`];
const RICH_TEXT = `Rich summary ${RUN_ID}`;
const LIST_ITEM = `List item ${RUN_ID}`;
const LINK_TEXT = 'Safe link';
const BAD_LINK_TEXT = 'Bad link';
const SAFE_LINK = 'https://example.com/e2e';
const BAD_LINK = 'javascript:alert(1)';
const FORMAT_SETTLE_MS = 300;
const TOOLBAR_BUTTONS = 11;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_SERVER_ERROR = 500;
const DOCUMENTS_PATH = `/documents/${CV_SLUG}`;

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: COPY.login.emailLabel }).fill(email);
  await page.getByLabel(COPY.login.passwordLabel).fill(password);
  await page.getByRole('button', { name: COPY.login.submit }).click();
  await expect(
    page.getByRole('button', { name: COPY.session.signOut }),
  ).toBeVisible();
}

const saveButton = (page: Page) =>
  page.getByRole('button', { name: copy.save, exact: true });

/** Clicks Save, expects a 2xx PUT, then the success notice. */
const noticeShown: boolean[] = [];
const NOTICE_WAIT_MS = 3_000;

async function saveDraftAndExpectNotice(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(DOCUMENTS_PATH) && r.request().method() === 'PUT',
    ),
    saveButton(page).click(),
  ]);
  expect(response.ok()).toBe(true);
  // Judged in the last test, so a missing notice does not skip the other flows.
  noticeShown.push(
    await page
      .getByText(copy.saved)
      .waitFor({ timeout: NOTICE_WAIT_MS })
      .then(
        () => true,
        () => false,
      ),
  );
}

const section = (page: Page | Locator, label: string) =>
  page.getByRole('region', { name: label, exact: true });

const pageOf = (scope: Page | Locator): Page =>
  'page' in scope && typeof scope.page === 'function'
    ? scope.page()
    : (scope as Page);

/** `has` is matched relative to each list item, so it is built from the page. */
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

const addButton = (scope: Page | Locator, label: string) =>
  scope.getByRole('button', { name: list.add(label), exact: true });

const field = (scope: Page | Locator, label: string) =>
  scope.getByLabel(label, { exact: true });

/** Selects the last `count` characters (Home/End differ between platforms). */
async function selectBack(page: Page, count: number) {
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press('Shift+ArrowLeft');
  }
}

const richtextEditor = (scope: Page | Locator, label: string) =>
  scope.getByRole('textbox', { name: label, exact: true });

/** Clicks a toolbar button and waits until focus is back in the editor. */
async function applyFormat(
  page: Page,
  editor: Locator,
  button: Locator,
): Promise<void> {
  await button.click();
  await expect(editor).toBeFocused();
  // Keys sent right after a toolbar click can be lost while the editor re-syncs.
  await page.waitForTimeout(FORMAT_SETTLE_MS);
}

const toolbarButton = (scope: Page | Locator, label: string) =>
  scope.getByRole('button', { name: label, exact: true });

/** The presence heartbeat is a POST too, but not a write. */
const PRESENCE_SUFFIX = '/presence';

/** Writes (not reads) to the documents API, recorded for assertions. */
function recordWrites(page: Page) {
  const writes: Request[] = [];
  const onRequest = (request: Request) => {
    if (
      request.url().includes(DOCUMENTS_PATH) &&
      !request.url().endsWith(PRESENCE_SUFFIX) &&
      ['POST', 'PUT'].includes(request.method())
    ) {
      writes.push(request);
    }
  };
  page.on('request', onRequest);
  return { writes, stop: () => page.off('request', onRequest) };
}

function recordConsole(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

const bodyOf = (request: Request) =>
  JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;

test.describe.serial('owner: dynamic document form (cv-page)', () => {
  let context: BrowserContext;
  let page: Page;
  let editUrl = '';
  const consoleProblems: string[] = [];

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    consoleProblems.push(...recordConsole(page));
    await signIn(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('a new cv-page shows every field type, richtext as an editor', async () => {
    await page.goto(contentNewPath(CV_SLUG));
    await expect(
      page.getByRole('heading', { level: 1, name: copy.newTitle(CV_SLUG) }),
    ).toBeVisible();
    await expect(field(page, 'Position')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Is main' })).toBeVisible();
    await expect(field(page, 'Company')).toBeVisible();
    await expect(richtextEditor(page, 'Summary')).toBeVisible();
    await expect(
      page.getByRole('toolbar', { name: copy.richtext.toolbar }).first(),
    ).toBeVisible();
    await expect(page.getByText(copy.notEditableYet)).toHaveCount(0);
    for (const label of [
      'Skill',
      'Experience',
      'Project',
      'Education',
      'Language',
      'Reference',
    ]) {
      await expect(section(page, label)).toBeVisible();
      await expect(addButton(page, label)).toBeVisible();
      await expect(section(page, label)).toContainText(list.empty(label));
    }
  });

  test('keyboard: the switch toggles with Space and fields follow DOM order', async () => {
    const toggle = page.getByRole('switch', { name: 'Is main' });
    await field(page, 'Position').focus();
    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    await expect(toggle).not.toBeChecked();
    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked();
    await page.keyboard.press('Space');
    await expect(toggle).not.toBeChecked();
    await page.keyboard.press('Tab');
    await expect(field(page, 'Company')).toBeFocused();
  });

  test('nested validation shows inline errors and sends nothing', async () => {
    const { writes, stop } = recordWrites(page);
    await addButton(page, 'Experience').click();
    const experience = item(page, 'Experience', 0);
    await addButton(experience, 'Role').click();
    const role = item(experience, 'Role', 0);
    await field(role, 'Team size').fill(TEAM_SIZE_DECIMAL);
    await field(role, 'Tech stack').fill(NOT_JSON);
    await saveButton(page).click();
    await expect(role).toContainText(copy.invalidInteger);
    await expect(role).toContainText(copy.invalidJson);
    expect(writes).toHaveLength(0);
    stop();

    // Remove the invalid experience again.
    await experience
      .getByRole('button', { name: list.remove('Experience', 0) })
      .click();
    await expect(section(page, 'Experience')).toContainText(
      list.empty('Experience'),
    );
  });

  test('creating a draft posts once and moves to the edit URL with the values', async () => {
    const { writes, stop } = recordWrites(page);
    await field(page, 'Position').fill(POSITION);
    await addButton(page, 'Skill').click();
    await field(item(page, 'Skill', 0), 'Skill').fill(SKILL_NAMES[0] ?? '');
    await field(item(page, 'Skill', 0), 'Level').fill('Expert');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(EDIT_URL);
    stop();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.method()).toBe('POST');
    const body = bodyOf(writes[0] as Request);
    expect(JSON.stringify(body)).toContain(POSITION);
    expect(JSON.stringify(body)).not.toContain('summary');
    editUrl = page.url();

    await expect(
      page.getByRole('heading', { level: 1, name: copy.editTitle(CV_SLUG) }),
    ).toBeVisible();
    await expect(field(page, 'Position')).toHaveValue(POSITION);
    await expect(field(item(page, 'Skill', 0), 'Skill')).toHaveValue(
      SKILL_NAMES[0] ?? '',
    );
  });

  test('editing sends only changed top-level fields, keeps the uid, and survives reload', async () => {
    // Add two more skills, save, then edit.
    for (const name of SKILL_NAMES.slice(1)) {
      await addButton(page, 'Skill').click();
      const count = await section(page, 'Skill').getByRole('listitem').count();
      await field(item(page, 'Skill', count - 1), 'Skill').fill(name);
    }
    let recorder = recordWrites(page);
    await saveDraftAndExpectNotice(page);
    recorder.stop();
    expect(recorder.writes).toHaveLength(1);
    expect(recorder.writes[0]?.method()).toBe('PUT');
    let body = bodyOf(recorder.writes[0] as Request);
    expect(Object.keys(body).sort()).toEqual(['components', 'version']);

    // Change one top-level field only.
    await field(page, 'Position').fill(POSITION_EDITED);
    recorder = recordWrites(page);
    await saveDraftAndExpectNotice(page);
    recorder.stop();
    body = bodyOf(recorder.writes[0] as Request);
    expect(Object.keys(body).sort()).toEqual(['values', 'version']);
    expect(body['values']).toEqual({ position: POSITION_EDITED });

    await page.reload();
    await expect(field(page, 'Position')).toHaveValue(POSITION_EDITED);
  });

  test('richtext: toolbar formatting, links and cleared text persist across reload', async () => {
    const editor = richtextEditor(page, 'Summary');
    const toolbar = page
      .getByRole('toolbar', { name: copy.richtext.toolbar })
      .first();
    await editor.click();
    await page.keyboard.type(RICH_TEXT);
    await page.keyboard.press('ControlOrMeta+A');
    await applyFormat(page, editor, toolbarButton(toolbar, copy.richtext.bold));
    await expect(editor.locator('strong')).toContainText(RICH_TEXT);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await applyFormat(
      page,
      editor,
      toolbarButton(toolbar, copy.richtext.bulletList),
    );
    await page.keyboard.type(LIST_ITEM);
    await expect(editor.locator('ul li')).toContainText(LIST_ITEM);

    // https link kept; javascript: link refused by the editor or the server.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type(LINK_TEXT);
    await selectBack(page, LINK_TEXT.length);
    page.once('dialog', (dialog) => void dialog.accept(SAFE_LINK));
    await applyFormat(page, editor, toolbarButton(toolbar, copy.richtext.link));
    await expect(editor.locator('a')).toHaveAttribute('href', SAFE_LINK);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.type(BAD_LINK_TEXT);
    await selectBack(page, BAD_LINK_TEXT.length);
    page.once('dialog', (dialog) => void dialog.accept(BAD_LINK));
    await applyFormat(page, editor, toolbarButton(toolbar, copy.richtext.link));

    const recorder = recordWrites(page);
    await saveDraftAndExpectNotice(page);
    recorder.stop();
    const sent = bodyOf(recorder.writes[0] as Request);
    expect(JSON.stringify(sent)).toContain('<strong>');

    await page.reload();
    const reloaded = richtextEditor(page, 'Summary');
    await expect(reloaded.locator('strong')).toContainText(RICH_TEXT);
    await expect(reloaded.locator('ul li')).toContainText(LIST_ITEM);
    await expect(reloaded.locator(`a[href="${SAFE_LINK}"]`)).toHaveCount(1);
    await expect(reloaded.locator('a[href^="javascript"]')).toHaveCount(0);
    await expect(reloaded).toContainText(BAD_LINK_TEXT);

    // Clearing everything saves an empty value.
    await reloaded.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await saveDraftAndExpectNotice(page);
    await page.reload();
    await expect(richtextEditor(page, 'Summary')).toHaveText('');
  });

  test('richtext: keyboard reaches the toolbar and then the editor', async () => {
    const first = toolbarButton(page, copy.richtext.bold).first();
    await first.focus();
    await expect(first).toBeFocused();
    await expect(first).toHaveCSS('outline-style', /.*/);
    for (let i = 0; i < TOOLBAR_BUTTONS; i += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(richtextEditor(page, 'Summary')).toBeFocused();
  });

  test('reordering and removing skills keeps the same rows (component uid)', async () => {
    const skillValue = (index: number) =>
      field(item(page, 'Skill', index), 'Skill');
    await expect(skillValue(0)).toHaveValue(SKILL_NAMES[0] ?? '');
    await expect(skillValue(2)).toHaveValue(SKILL_NAMES[2] ?? '');
    await expect(
      page.getByRole('button', { name: list.moveUp('Skill', 0) }),
    ).toBeDisabled();

    // Move the last skill to the top, remove the middle one.
    await page.getByRole('button', { name: list.moveUp('Skill', 2) }).click();
    await page.getByRole('button', { name: list.moveUp('Skill', 1) }).click();
    await expect(skillValue(0)).toHaveValue(SKILL_NAMES[2] ?? '');
    await page.getByRole('button', { name: list.remove('Skill', 2) }).click();

    const recorder = recordWrites(page);
    await saveDraftAndExpectNotice(page);
    recorder.stop();
    const sent = JSON.stringify(bodyOf(recorder.writes[0] as Request));
    expect(sent).toContain('componentUid');

    await page.reload();
    await expect(skillValue(0)).toHaveValue(SKILL_NAMES[2] ?? '');
    await expect(skillValue(1)).toHaveValue(SKILL_NAMES[0] ?? '');
    await expect(section(page, 'Skill').getByRole('listitem')).toHaveCount(2);
  });

  test('a stale version shows the conflict alert and reload fetches the latest', async () => {
    const other = await context.newPage();
    await other.goto(editUrl);
    await expect(field(other, 'Position')).toHaveValue(POSITION_EDITED);

    await field(page, 'Position').fill(`${POSITION_EDITED} A`);
    await saveDraftAndExpectNotice(page);

    await field(other, 'Position').fill(`${POSITION_EDITED} B`);
    await saveButton(other).click();
    // The conflict opens the merge modal; Cancel leaves the alert.
    const mergeDialog = other.getByRole('dialog', {
      name: copy.conflict.title,
    });
    await expect(mergeDialog).toBeVisible();
    await mergeDialog
      .getByRole('button', { name: copy.conflict.cancel, exact: true })
      .click();
    await expect(mergeDialog).toBeHidden();
    await expect(other.getByRole('alert')).toContainText(copy.errors.conflict);
    // The typed value is still there until the user reloads.
    await expect(field(other, 'Position')).toHaveValue(`${POSITION_EDITED} B`);
    await other.getByRole('button', { name: copy.errors.reload }).click();
    await expect(field(other, 'Position')).toHaveValue(`${POSITION_EDITED} A`);
    await expect(other.getByRole('alert')).toHaveCount(0);
    await other.close();
  });

  test('a server 400 shows its message in an alert and keeps the input', async () => {
    const message = 'position is too long';
    await page.route(`**${DOCUMENTS_PATH}/*`, async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      return route.fulfill({
        status: HTTP_BAD_REQUEST,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: HTTP_BAD_REQUEST,
          errorCode: API_ERROR_CODES.DOCUMENT_INVALID,
          message,
        }),
      });
    });
    await field(page, 'Position').fill('kept value');
    await saveButton(page).click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(field(page, 'Position')).toHaveValue('kept value');
    await page.unroute(`**${DOCUMENTS_PATH}/*`);
  });

  test('a 409 version conflict (mocked) offers a reload', async () => {
    await page.route(`**${DOCUMENTS_PATH}/*`, async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      return route.fulfill({
        status: HTTP_CONFLICT,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: HTTP_CONFLICT,
          errorCode: API_ERROR_CODES.DOCUMENT_VERSION_CONFLICT,
          message: 'conflict',
        }),
      });
    });
    await saveButton(page).click();
    await expect(page.getByRole('alert')).toContainText(copy.errors.conflict);
    await expect(
      page.getByRole('button', { name: copy.errors.reload }),
    ).toBeVisible();
    await page.unroute(`**${DOCUMENTS_PATH}/*`);
  });

  test('masked fields are read-only "Protected" and never sent', async () => {
    const masked = ['company', 'reference.phone', 'summary'];
    await page.route(`**${DOCUMENTS_PATH}/*`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      const json = (await response.json()) as Record<string, unknown>;
      json['_maskedFields'] = masked;
      json['values'] = {
        ...(json['values'] as object),
        company: '***',
      };
      return route.fulfill({ response, json });
    });
    await page.reload();
    const company = field(page, 'Company');
    await expect(company).toHaveValue(copy.protectedValue);
    await expect(company).toHaveAttribute('readonly', '');
    await expect(field(page, 'Summary')).toHaveValue(copy.protectedValue);
    await expect(field(page, 'Summary')).toHaveAttribute('readonly', '');

    await field(page, 'Position').fill(`${POSITION_EDITED} masked`);
    await addButton(page, 'Reference').click();
    await expect(field(item(page, 'Reference', 0), 'Phone')).toHaveValue(
      copy.protectedValue,
    );
    await field(item(page, 'Reference', 0), 'Name').fill('Ref name');
    const recorder = recordWrites(page);
    await saveDraftAndExpectNotice(page);
    recorder.stop();
    const sent = JSON.stringify(bodyOf(recorder.writes[0] as Request));
    expect(sent).not.toContain('company');
    expect(sent).not.toContain('"phone"');
    expect(sent).not.toContain('***');
    await page.unroute(`**${DOCUMENTS_PATH}/*`);
  });

  test('a load failure shows a retry that recovers', async () => {
    let failing = true;
    await page.route(`**${DOCUMENTS_PATH}/*`, async (route) => {
      if (route.request().method() !== 'GET' || !failing) {
        return route.fallback();
      }
      return route.fulfill({
        status: HTTP_SERVER_ERROR,
        contentType: 'application/json',
        body: '{}',
      });
    });
    await page.reload();
    await expect(page.getByText(copy.loadFailed)).toBeVisible();
    failing = false;
    await page.getByRole('button', { name: copy.retry }).click();
    await expect(field(page, 'Position')).toBeVisible();
    await page.unroute(`**${DOCUMENTS_PATH}/*`);
  });

  test('an unknown document and an unknown type show a notice', async () => {
    await page.goto(`/content/${CV_SLUG}/00000000-0000-4000-8000-000000000000`);
    await expect(page.getByText(copy.documentNotFound)).toBeVisible();
    await page.goto('/content/no-such-type/new');
    await expect(page.getByText(copy.typeNotFound)).toBeVisible();
  });

  test('the console stayed free of unexpected errors', () => {
    // Deliberate 4xx/5xx responses above log "Failed to load resource".
    const unexpected = consoleProblems.filter(
      (text) => !text.includes('Failed to load resource'),
    );
    expect(unexpected).toEqual([]);
  });

  test('every save showed the "Draft saved." notice', () => {
    expect(noticeShown.length).toBeGreaterThan(0);
    expect(noticeShown.every(Boolean)).toBe(true);
  });
});
