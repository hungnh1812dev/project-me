import {
  type BrowserContext,
  expect,
  type Page,
  type Request,
  test,
} from '@playwright/test';

import { PRESENCE_HEARTBEAT_MS } from '../../cms-admin/src/config/content.constants';
import { COPY } from '../../cms-admin/src/config/copy.constants';
import { contentNewPath } from '../../cms-admin/src/config/routes';
import { e2eEnv } from '../src/env';
import { mailIdsFor, waitForCode } from '../src/mailpit';

const copy = COPY.content;
const access = COPY.access;
const CV_SLUG = 'cv-page';
const EDIT_URL = /\/content\/cv-page\/[0-9a-f-]{36}$/;
const RUN_ID = Date.now().toString(36);
const PRESENCE_PATH = '/presence';
const BEAT_WAIT_MS = PRESENCE_HEARTBEAT_MS + 10_000;
/** Server TTL (45 s) plus one beat plus slack. */
const EXPIRY_WAIT_MS = 45_000 + PRESENCE_HEARTBEAT_MS + 10_000;
const TEST_TIMEOUT_MS = 180_000;
const EDITOR_EMAIL = `e2e-presence-${RUN_ID}@domain.localhost`;
const EDITOR_NAME = `Presence ${RUN_ID}`;
const EDITOR_PASSWORD = `${e2eEnv.ownerPassword.slice(0, 40)}-presence`;
const label = (name: string) => new RegExp(`^${name}`);
const ALSO_ON = /is also on this document\.$/;

const isBeat = (request: Request) =>
  request.url().includes(PRESENCE_PATH) && request.method() === 'POST';

function recordBeats(page: Page) {
  const beats: Request[] = [];
  const onRequest = (request: Request) => {
    if (isBeat(request)) beats.push(request);
  };
  page.on('request', onRequest);
  return { beats, stop: () => page.off('request', onRequest) };
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: COPY.login.emailLabel }).fill(email);
  await page.getByLabel(COPY.login.passwordLabel).fill(password);
  await page.getByRole('button', { name: COPY.login.submit }).click();
  await expect(
    page.getByRole('button', { name: COPY.session.signOut }),
  ).toBeVisible();
}

const banner = (page: Page) => page.getByText(ALSO_ON);
const position = (page: Page) => page.getByLabel('Position', { exact: true });

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(position(page)).toBeVisible();
}

test.describe.serial('presence banner (cv-page, two accounts)', () => {
  test.setTimeout(TEST_TIMEOUT_MS);
  let ownerContext: BrowserContext;
  let editorContext: BrowserContext;
  let owner: Page;
  let editor: Page;
  let editUrl = '';
  const consoleProblems: string[] = [];

  test.beforeAll(async ({ browser }) => {
    ownerContext = await browser.newContext();
    owner = await ownerContext.newPage();
    owner.on('pageerror', (error) => consoleProblems.push(error.message));
    await signIn(owner, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  });

  test.afterAll(async () => {
    await editorContext?.close();
    await ownerContext.close();
  });

  test('setup: a draft and a second account that can edit it', async ({
    browser,
  }) => {
    await owner.goto(contentNewPath(CV_SLUG));
    await position(owner).fill(`Presence ${RUN_ID}`);
    await owner.keyboard.press('Enter');
    await expect(owner).toHaveURL(EDIT_URL);
    editUrl = owner.url();

    await owner.goto('/accounts');
    const seen = await mailIdsFor(ownerContext, EDITOR_EMAIL);
    await owner.getByRole('button', { name: access.accounts.invite }).click();
    const dialog = owner.getByRole('dialog', { name: access.invite.title });
    await dialog.getByLabel(label(access.invite.emailLabel)).fill(EDITOR_EMAIL);
    await dialog
      .getByLabel(label(access.invite.displayNameLabel))
      .fill(EDITOR_NAME);
    await dialog
      .getByLabel(label(access.invite.roleLabel))
      .selectOption('Admin');
    await dialog.getByRole('button', { name: access.invite.submit }).click();
    await expect(dialog).toBeHidden();
    const code = await waitForCode(ownerContext, EDITOR_EMAIL, seen);

    editorContext = await browser.newContext();
    editor = await editorContext.newPage();
    editor.on('pageerror', (error) => consoleProblems.push(error.message));
    await editor.goto('/set-password');
    await editor.getByLabel(label(COPY.password.emailLabel)).fill(EDITOR_EMAIL);
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
    await signIn(editor, EDITOR_EMAIL, EDITOR_PASSWORD);
  });

  test('a single session sees no banner and sends one empty beat per period', async () => {
    const recorder = recordBeats(owner);
    await open(owner, editUrl);
    await expect.poll(() => recorder.beats.length).toBeGreaterThanOrEqual(1);
    expect(recorder.beats[0]?.postData() ?? '{}').toBe('{}');
    await expect(banner(owner)).toHaveCount(0);
    await expect(owner.getByRole('alert')).toHaveCount(0);
    recorder.stop();
  });

  test('two sessions see each other, never themselves', async () => {
    await open(editor, editUrl);
    await expect(banner(owner)).toContainText(EDITOR_NAME, {
      timeout: BEAT_WAIT_MS,
    });
    await expect(banner(editor)).toBeVisible();
    await expect(banner(editor)).not.toContainText(EDITOR_NAME);
  });

  test('leaving the page stops the beats; the other banner expires', async () => {
    const recorder = recordBeats(editor);
    await editor.goto(`/content/${CV_SLUG}`);
    await editor.waitForLoadState('networkidle');
    const before = recorder.beats.length;
    await editor.waitForTimeout(BEAT_WAIT_MS);
    expect(recorder.beats.length).toBe(before);
    recorder.stop();
    await expect(banner(owner)).toHaveCount(0, { timeout: EXPIRY_WAIT_MS });
  });

  test('a new document sends no presence request', async () => {
    const recorder = recordBeats(owner);
    await owner.goto(contentNewPath(CV_SLUG));
    await expect(position(owner)).toBeVisible();
    await owner.waitForTimeout(copyWait());
    expect(recorder.beats).toHaveLength(0);
    recorder.stop();
    expect(copy.presence.one('x')).toContain('x');
  });

  test('the console stayed free of page errors', () => {
    expect(consoleProblems).toEqual([]);
  });
});

function copyWait(): number {
  return PRESENCE_HEARTBEAT_MS + 2_000;
}
