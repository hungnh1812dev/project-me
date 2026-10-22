import { execFileSync } from 'node:child_process';

import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';

import { COPY as ADMIN_COPY } from '../../cms-admin/src/config/copy.constants';
import { COPY } from '../../web/src/config/copy.constants';
import {
  SMOKE_DB_CONTAINER,
  SMOKE_DB_NAME,
  SMOKE_DB_USER,
} from '../src/constants';
import { e2eEnv } from '../src/env';

/**
 * T32: reviewer access. Web dialog (anonymous visitor), the reviewer token
 * held in memory, API refusals for a reviewer, and the owner's /reviewer page.
 * Needs internet: the smoke stack verifies Turnstile tokens against Cloudflare
 * with the public always-pass test keys. cms-api allows one session per IP per
 * 10 minutes, so the spec clears the sessions table first (smoke database only).
 * One session is created for real; everything else reuses it.
 */
test.describe.configure({ mode: 'serial', retries: 0 });

const copy = COPY.reviewer;
const admin = ADMIN_COPY.reviewer;
const RUN_ID = Date.now().toString(36);
const XSS_NOTES = `<img src=x onerror=alert(1)> ${RUN_ID}`;
const OTHER_ROLE = `Auditor ${RUN_ID}`;
const OTHER_PURPOSE = `Audit ${RUN_ID}`;
const NOTES_MAX = 500;
const UNKNOWN_UUID = '018f0000-0000-7000-8000-000000000000';
const CV_SLUG = 'cv-page';
const HTTP = {
  OK: 200,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
} as const;
const TURNSTILE_HOST = '**/challenges.cloudflare.com/**';
const SESSIONS_PATH = '/reviewer/sessions';
const label = (name: string) => new RegExp(`^${name}`);

const openButton = (page: Page) =>
  page.getByRole('button', { name: copy.open, exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: copy.title });
const next = (page: Page) =>
  dialog(page).getByRole('button', { name: copy.next, exact: true });
const submit = (page: Page) =>
  dialog(page).getByRole('button', { name: copy.submit, exact: true });
const step = (page: Page, n: number) =>
  dialog(page).getByText(copy.stepLabel(n, 3));
const url = (path: string) => `${e2eEnv.apiBaseUrl}${path}`;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function sql(statement: string): void {
  execFileSync('docker', [
    'exec',
    SMOKE_DB_CONTAINER,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    SMOKE_DB_USER,
    '-d',
    SMOKE_DB_NAME,
    '-c',
    statement,
  ]);
}

async function ownerToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(url('/auth/login'), {
    data: { email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword },
  });
  expect(res.status()).toBe(HTTP.OK);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function setEnabled(
  request: APIRequestContext,
  token: string,
  enabled: boolean,
): Promise<void> {
  const res = await request.put(url('/reviewer/settings'), {
    headers: bearer(token),
    data: { enabled },
  });
  expect(res.status()).toBe(HTTP.OK);
}

async function adminSignIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: ADMIN_COPY.login.emailLabel })
    .fill(email);
  await page.getByLabel(ADMIN_COPY.login.passwordLabel).fill(password);
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
  await expect(
    page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
  ).toBeVisible();
}

/** Walks steps 1 and 2 with the given answers and lands on step 3. */
async function reachNotesStep(page: Page, role: string, purpose?: string) {
  await dialog(page).getByLabel(label(copy.role.label)).selectOption(role);
  await next(page).click();
  if (purpose !== undefined) {
    await dialog(page).getByLabel(purpose, { exact: true }).check();
  }
  await next(page).click();
  await expect(step(page, 3)).toBeVisible();
}

test.describe('reviewer access', () => {
  let context: BrowserContext;
  let owner: string;
  let reviewerToken = '';

  test.beforeAll(async ({ browser, playwright }) => {
    sql('DELETE FROM reviewer_sessions');
    context = await browser.newContext();
    const api = await playwright.request.newContext();
    owner = await ownerToken(api);
    await setEnabled(api, owner, false);
    await api.dispose();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('switch off: no Reviewer access button on the web', async () => {
    const page = await context.newPage();
    const status = page.waitForResponse((res) =>
      res.url().endsWith('/reviewer/status'),
    );
    await page.goto(e2eEnv.webUrl);
    expect(await (await status).json()).toEqual({ enabled: false });
    await expect(
      page.getByRole('button', { name: COPY.session.signIn }),
    ).toBeVisible();
    await expect(openButton(page)).toHaveCount(0);
    await page.close();
  });

  test('owner switches reviewer access on in the admin; the web offers the button, and a failing status hides it', async () => {
    const adminPage = await context.newPage();
    await adminSignIn(adminPage, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
    await adminPage
      .getByRole('navigation', { name: ADMIN_COPY.access.nav.label })
      .getByRole('link', { name: ADMIN_COPY.access.nav.reviewer })
      .click();
    await expect(
      adminPage.getByRole('heading', { level: 1, name: admin.title }),
    ).toBeVisible();
    const toggle = adminPage.getByRole('switch', { name: admin.switch.label });
    await expect(toggle).not.toBeChecked();
    await expect(adminPage.getByText(admin.empty)).toBeVisible();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(adminPage.getByText(admin.switch.onHint)).toBeVisible();
    await adminPage.close();

    const page = await context.newPage();
    await page.route('**/reviewer/status', (route) =>
      route.fulfill({ status: 500, body: '{}' }),
    );
    await page.goto(e2eEnv.webUrl);
    await expect(
      page.getByRole('button', { name: COPY.session.signIn }),
    ).toBeVisible();
    await expect(openButton(page)).toHaveCount(0);
    await page.unroute('**/reviewer/status');
    await page.reload();
    await expect(openButton(page)).toBeVisible();
    await page.close();
  });

  test('the dialog validates each step, Enter moves on without submitting, and Submit without a passed check is refused', async () => {
    const page = await context.newPage();
    // The check cannot load: the widget never yields a token.
    await page.route(TURNSTILE_HOST, (route) =>
      route.fulfill({ status: 500, body: '' }),
    );
    let posted = 0;
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith(SESSIONS_PATH)) {
        posted += 1;
      }
    });
    await page.goto(e2eEnv.webUrl);
    await openButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(step(page, 1)).toBeVisible();

    // Step 1: a role is required; Other needs text.
    await next(page).click();
    await expect(
      dialog(page).getByText(copy.validation.roleRequired),
    ).toBeVisible();
    await dialog(page)
      .getByLabel(label(copy.role.label))
      .selectOption(copy.role.other);
    await next(page).click();
    await expect(
      dialog(page).getByText(copy.validation.roleOtherRequired),
    ).toBeVisible();
    const other = dialog(page).getByLabel(label(copy.role.otherLabel));
    await other.fill(OTHER_ROLE);
    await other.press('Enter');
    await expect(step(page, 2)).toBeVisible();

    // Step 2: optional, but Other needs text; Enter moves on.
    await next(page).click();
    await expect(step(page, 3)).toBeVisible();
    await dialog(page).getByRole('button', { name: copy.back }).click();
    await dialog(page).getByLabel(copy.purposes.other, { exact: true }).check();
    await next(page).click();
    await expect(
      dialog(page).getByText(copy.validation.purposeOtherRequired),
    ).toBeVisible();
    const purpose = dialog(page).getByLabel(label(copy.purposes.otherLabel));
    await purpose.fill(OTHER_PURPOSE);
    await next(page).click();
    await expect(step(page, 3)).toBeVisible();
    expect(posted).toBe(0);

    // Step 3: notes over the limit, then no verification.
    const notes = dialog(page).getByLabel(label(copy.notes.label));
    await notes.fill('x'.repeat(NOTES_MAX + 1));
    await submit(page).click();
    await expect(
      dialog(page).getByText(copy.validation.notesTooLong(NOTES_MAX)),
    ).toBeVisible();
    await notes.fill('x'.repeat(NOTES_MAX));
    await submit(page).click();
    await expect(dialog(page).getByText(copy.turnstile.required)).toBeVisible();
    expect(posted).toBe(0);

    // Esc closes; reopening starts clean.
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await openButton(page).click();
    await expect(step(page, 1)).toBeVisible();
    await page.close();
  });

  test('Enter on step 2 moves on when the role is a listed one', async () => {
    const page = await context.newPage();
    await page.goto(e2eEnv.webUrl);
    await openButton(page).click();
    await dialog(page)
      .getByLabel(label(copy.role.label))
      .selectOption('Recruiter');
    await next(page).click();
    await dialog(page).getByLabel(copy.purposes.other, { exact: true }).check();
    await dialog(page)
      .getByLabel(label(copy.purposes.otherLabel))
      .fill(OTHER_PURPOSE);
    await dialog(page)
      .getByLabel(label(copy.purposes.otherLabel))
      .press('Enter');
    await expect(step(page, 3)).toBeVisible();
    await page.close();
  });

  test('Enter on step 2 moves on when the role is Other and the purpose is Other', async () => {
    const page = await context.newPage();
    await page.goto(e2eEnv.webUrl);
    await openButton(page).click();
    await dialog(page)
      .getByLabel(label(copy.role.label))
      .selectOption(copy.role.other);
    await dialog(page).getByLabel(label(copy.role.otherLabel)).fill(OTHER_ROLE);
    await next(page).click();
    await dialog(page).getByLabel(copy.purposes.other, { exact: true }).check();
    const purpose = dialog(page).getByLabel(label(copy.purposes.otherLabel));
    await purpose.fill(OTHER_PURPOSE);
    await purpose.press('Enter');
    await expect(step(page, 3)).toBeVisible({ timeout: 2_000 });
    await page.close();
  });

  test('a Turnstile script that cannot load shows the could-not-load message', async () => {
    const page = await context.newPage();
    await page.route(TURNSTILE_HOST, (route) =>
      route.fulfill({ status: 500, body: '' }),
    );
    await page.goto(e2eEnv.webUrl);
    await openButton(page).click();
    await reachNotesStep(page, 'Recruiter');
    await expect(dialog(page).getByText(copy.turnstile.failed)).toBeVisible();
    await page.close();
  });

  test('the could-not-load message stays after Back and Next', async () => {
    const page = await context.newPage();
    await page.route(TURNSTILE_HOST, (route) =>
      route.fulfill({ status: 500, body: '' }),
    );
    await page.goto(e2eEnv.webUrl);
    await openButton(page).click();
    await reachNotesStep(page, 'Recruiter');
    await expect(dialog(page).getByText(copy.turnstile.failed)).toBeVisible();
    await dialog(page).getByRole('button', { name: copy.back }).click();
    await next(page).click();
    await expect(step(page, 3)).toBeVisible();
    await expect(dialog(page).getByText(copy.turnstile.failed)).toBeVisible({
      timeout: 3_000,
    });
    await page.close();
  });

  test('a passing check starts a reviewer session held in memory only', async () => {
    const page = await context.newPage();
    const consoleProblems: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleProblems.push(msg.text());
    });
    await page.goto(e2eEnv.webUrl);
    await openButton(page).click();
    await reachNotesStep(page, 'Recruiter', 'Hiring');
    await dialog(page).getByLabel(label(copy.notes.label)).fill(XSS_NOTES);

    const created = page.waitForResponse(
      (res) =>
        res.url().endsWith(SESSIONS_PATH) && res.request().method() === 'POST',
    );
    // The always-pass widget needs a moment to hand over its token.
    await expect(async () => {
      await submit(page).click();
      await expect(dialog(page)).toHaveCount(0, { timeout: 8_000 });
    }).toPass({ timeout: 30_000 });
    const response = await created;
    expect(response.status()).toBe(201);
    reviewerToken = ((await response.json()) as { accessToken: string })
      .accessToken;
    expect(reviewerToken).not.toBe('');

    await expect(page.getByText(COPY.session.reviewing)).toBeVisible();
    await expect(
      page.getByRole('button', { name: COPY.session.endReview }),
    ).toBeVisible();
    await expect(openButton(page)).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: COPY.session.openCms }),
    ).toHaveCount(0);
    expect(
      consoleProblems.filter((text) => /content security policy/i.test(text)),
    ).toEqual([]);

    const stored = await page.evaluate(() => ({
      local: Object.keys(window.localStorage),
      session: Object.keys(window.sessionStorage),
      cookie: document.cookie,
    }));
    expect(stored).toEqual({ local: [], session: [], cookie: '' });

    const me = await page.request.get(url('/auth/me'), {
      headers: bearer(reviewerToken),
    });
    expect(me.status()).toBe(HTTP.OK);
    expect(JSON.stringify(await me.json())).toContain('"reviewer"');

    // A reload is anonymous again: nothing persisted.
    await page.reload();
    await expect(
      page.getByRole('button', { name: COPY.session.signIn }),
    ).toBeVisible();
    await expect(page.getByText(COPY.session.reviewing)).toHaveCount(0);

    // End review is local: the token stays valid until it expires.
    await page.close();
  });

  test('the reviewer token reads published content and is refused drafts and every write', async ({
    request,
  }) => {
    const headers = bearer(reviewerToken);
    const published = await request.get(url(`/documents/${CV_SLUG}`), {
      headers,
    });
    expect(published.status()).toBe(HTTP.OK);

    const draft = await request.get(url(`/documents/${CV_SLUG}?status=draft`), {
      headers,
    });
    expect([HTTP.FORBIDDEN, HTTP.NOT_FOUND]).toContain(draft.status());
    const draftById = await request.get(
      url(`/documents/${CV_SLUG}/${UNKNOWN_UUID}?status=draft`),
      { headers },
    );
    expect([HTTP.FORBIDDEN, HTTP.NOT_FOUND]).toContain(draftById.status());

    const writes = [
      await request.post(url(`/documents/${CV_SLUG}`), {
        headers,
        data: { tree: {} },
      }),
      await request.put(url(`/documents/${CV_SLUG}/${UNKNOWN_UUID}`), {
        headers,
        data: { version: 1, tree: {} },
      }),
      await request.delete(url(`/documents/${CV_SLUG}/${UNKNOWN_UUID}`), {
        headers,
      }),
      await request.patch(url(`/media/${UNKNOWN_UUID}`), {
        headers,
        data: { alt: 'x' },
      }),
      await request.put(url('/reviewer/settings'), {
        headers,
        data: { enabled: false },
      }),
      await request.get(url(SESSIONS_PATH), { headers }),
    ];
    for (const res of writes) expect(res.status()).toBe(HTTP.FORBIDDEN);
  });

  test('a second session from the same connection is refused with a retry time and a fresh check', async () => {
    const page = await context.newPage();
    await page.goto(e2eEnv.webUrl);
    await openButton(page).click();
    await reachNotesStep(page, 'Peer / colleague');
    await expect(async () => {
      await submit(page).click();
      await expect(
        dialog(page).getByText(
          /A review session was already started from this connection\. Try again in \d+ (second|minute)s?\./,
        ),
      ).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 30_000 });
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByText(COPY.session.reviewing)).toHaveCount(0);

    await page.close();
  });

  test('owner log shows the session with notes as text; switching off ends it and switching on does not revive it', async () => {
    const page = await context.newPage();
    const alerts: string[] = [];
    page.on('dialog', async (d) => {
      alerts.push(d.message());
      await d.dismiss();
    });
    // The context still holds the owner's refresh cookie: a silent refresh signs in.
    await page.goto('/reviewer');
    await expect(
      page.getByRole('heading', { level: 1, name: admin.title }),
    ).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: RUN_ID });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('rowheader')).toHaveText('Recruiter');
    await expect(row.getByText('Hiring')).toBeVisible();
    await expect(row.getByText(XSS_NOTES, { exact: false })).toBeVisible();
    await expect(row.locator('img')).toHaveCount(0);
    await expect(row.getByText(admin.status.active)).toBeVisible();

    // Cancel keeps it on.
    const toggle = page.getByRole('switch', { name: admin.switch.label });
    await expect(toggle).toBeChecked();
    await toggle.click();
    const confirm = page.getByRole('dialog', {
      name: admin.confirmOff.title,
    });
    await expect(confirm).toBeVisible();
    await confirm
      .getByRole('button', { name: admin.confirmOff.cancel })
      .click();
    await expect(confirm).toHaveCount(0);
    await expect(toggle).toBeChecked();
    await expect(row.getByText(admin.status.active)).toBeVisible();

    await toggle.click();
    await confirm
      .getByRole('button', { name: admin.confirmOff.submit })
      .click();
    await expect(confirm).toHaveCount(0);
    await expect(toggle).not.toBeChecked();
    await expect(row.getByText(admin.status.ended)).toBeVisible();

    const me = await page.request.get(url('/auth/me'), {
      headers: bearer(reviewerToken),
    });
    expect(me.status()).toBe(HTTP.UNAUTHORIZED);

    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(row.getByText(admin.status.ended)).toBeVisible();
    const again = await page.request.get(url('/auth/me'), {
      headers: bearer(reviewerToken),
    });
    expect(again.status()).toBe(HTTP.UNAUTHORIZED);
    expect(alerts).toEqual([]);
    await page.close();
  });

  test('the log marks the revoked session as ended', async ({ request }) => {
    const res = await request.get(url(SESSIONS_PATH), {
      headers: bearer(owner),
    });
    expect(res.status()).toBe(HTTP.OK);
    const body = (await res.json()) as {
      data: { notes: string | null; active: boolean }[];
    };
    const ours = body.data.find((row) => row.notes?.includes(RUN_ID));
    expect(ours?.active).toBe(false);
  });

  test('switched off between opening the dialog and submitting: the visitor sees the switched-off message', async ({
    request,
  }) => {
    const page = await context.newPage();
    await page.goto(e2eEnv.webUrl);
    await openButton(page).click();
    await reachNotesStep(page, 'Recruiter');
    await setEnabled(request, owner, false);
    await expect(async () => {
      await submit(page).click();
      await expect(dialog(page).getByText(copy.errors.disabled)).toBeVisible({
        timeout: 8_000,
      });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByText(COPY.session.reviewing)).toHaveCount(0);
    await page.close();
  });

  test('a role without reviewer settings sees no Reviewers nav and a forbidden note on /reviewer', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await adminSignIn(page, e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword);
    await expect(
      page
        .getByRole('navigation', { name: ADMIN_COPY.access.nav.label })
        .getByRole('link', { name: ADMIN_COPY.access.nav.reviewer }),
    ).toHaveCount(0);
    await page.goto('/reviewer');
    await expect(page.getByText(admin.forbidden)).toBeVisible();
    await expect(
      page.getByRole('switch', { name: admin.switch.label }),
    ).toBeDisabled();
    await ctx.close();
  });
});
