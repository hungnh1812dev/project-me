import { type BrowserContext, expect, test } from '@playwright/test';

import { WEB_COPY } from '../src/AppContracts.contract';
import { API_PATHS, apiUrl } from '../src/ApiPaths.constants';
import { HTTP } from '../src/E2e.constants';
import { CV_PAGE_SLUG } from '../src/ContentTypes.constants';
import { e2eEnv } from '../src/E2e.env';
import { RUN_ID } from '../src/RunId.constants';
import {
  dialog,
  openButton,
  reachNotesStep,
  reviewerAdminCopy as admin,
  reviewerCopy as copy,
  setEnabled,
  submit,
} from '../src/ReviewerDialog.fixture';
import { clearReviewerSessions } from '../src/SmokeDatabase.client';
import { bearer, ownerApiToken, signInAs } from '../src/Session.fixture';
import { labelStartingWith } from '../src/Locators.fixture';

/**
 * Reviewer access, session: a real session is created once (the smoke stack
 * verifies Turnstile with Cloudflare's always-pass test keys, so this needs
 * internet), the token held in memory is checked against the API, and the
 * owner's /reviewer page ends it. cms-api allows one session per IP per 10
 * minutes, so the spec clears the sessions table first (smoke database only).
 */
test.describe.configure({ mode: 'serial', retries: 0 });

const XSS_NOTES = `<img src=x onerror=alert(1)> ${RUN_ID}`;
const UNKNOWN_UUID = '018f0000-0000-7000-8000-000000000000';

test.describe('reviewer access: session', () => {
  let context: BrowserContext;
  let owner: string;
  let reviewerToken = '';

  test.beforeAll(async ({ browser, playwright }) => {
    clearReviewerSessions();
    context = await browser.newContext();
    const api = await playwright.request.newContext();
    owner = await ownerApiToken(api);
    await setEnabled(api, owner, true);
    await api.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    await setEnabled(api, owner, false);
    await api.dispose();
    await context.close();
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
    await dialog(page)
      .getByLabel(labelStartingWith(copy.notes.label))
      .fill(XSS_NOTES);

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith(API_PATHS.REVIEWER.SESSIONS) &&
        response.request().method() === 'POST',
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

    await expect(page.getByText(WEB_COPY.session.reviewing)).toBeVisible();
    await expect(
      page.getByRole('button', { name: WEB_COPY.session.endReview }),
    ).toBeVisible();
    await expect(openButton(page)).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: WEB_COPY.session.openCms }),
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

    const me = await page.request.get(apiUrl(API_PATHS.AUTH.ME), {
      headers: bearer(reviewerToken),
    });
    expect(me.status()).toBe(HTTP.OK);
    expect(JSON.stringify(await me.json())).toContain('"reviewer"');

    // A reload is anonymous again: nothing persisted.
    await page.reload();
    await expect(
      page.getByRole('button', { name: WEB_COPY.session.signIn }),
    ).toBeVisible();
    await expect(page.getByText(WEB_COPY.session.reviewing)).toHaveCount(0);

    // End review is local: the token stays valid until it expires.
    await page.close();
  });

  test('the reviewer token reads published content and is refused drafts and every write', async ({
    request,
  }) => {
    const headers = bearer(reviewerToken);
    const published = await request.get(
      apiUrl(API_PATHS.documents(CV_PAGE_SLUG)),
      {
        headers,
      },
    );
    expect(published.status()).toBe(HTTP.OK);

    const draft = await request.get(
      apiUrl(`${API_PATHS.documents(CV_PAGE_SLUG)}?status=draft`),
      {
        headers,
      },
    );
    expect([HTTP.FORBIDDEN, HTTP.NOT_FOUND]).toContain(draft.status());
    const draftById = await request.get(
      apiUrl(`${API_PATHS.document(CV_PAGE_SLUG, UNKNOWN_UUID)}?status=draft`),
      { headers },
    );
    expect([HTTP.FORBIDDEN, HTTP.NOT_FOUND]).toContain(draftById.status());

    const writes = [
      await request.post(apiUrl(API_PATHS.documents(CV_PAGE_SLUG)), {
        headers,
        data: { tree: {} },
      }),
      await request.put(
        apiUrl(API_PATHS.document(CV_PAGE_SLUG, UNKNOWN_UUID)),
        {
          headers,
          data: { version: 1, tree: {} },
        },
      ),
      await request.delete(
        apiUrl(API_PATHS.document(CV_PAGE_SLUG, UNKNOWN_UUID)),
        {
          headers,
        },
      ),
      await request.patch(apiUrl(API_PATHS.media(UNKNOWN_UUID)), {
        headers,
        data: { alt: 'x' },
      }),
      await request.put(apiUrl(API_PATHS.REVIEWER.SETTINGS), {
        headers,
        data: { enabled: false },
      }),
      await request.get(apiUrl(API_PATHS.REVIEWER.SESSIONS), { headers }),
    ];
    for (const response of writes)
      expect(response.status()).toBe(HTTP.FORBIDDEN);
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
    await expect(page.getByText(WEB_COPY.session.reviewing)).toHaveCount(0);

    await page.close();
  });

  test('owner log shows the session with notes as text; switching off ends it and switching on does not revive it', async () => {
    const page = await context.newPage();
    const alerts: string[] = [];
    page.on('dialog', async (d) => {
      alerts.push(d.message());
      await d.dismiss();
    });
    await signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
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

    const me = await page.request.get(apiUrl(API_PATHS.AUTH.ME), {
      headers: bearer(reviewerToken),
    });
    expect(me.status()).toBe(HTTP.UNAUTHORIZED);

    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(row.getByText(admin.status.ended)).toBeVisible();
    const again = await page.request.get(apiUrl(API_PATHS.AUTH.ME), {
      headers: bearer(reviewerToken),
    });
    expect(again.status()).toBe(HTTP.UNAUTHORIZED);
    expect(alerts).toEqual([]);
    await page.close();
  });

  test('the log marks the revoked session as ended', async ({ request }) => {
    const response = await request.get(apiUrl(API_PATHS.REVIEWER.SESSIONS), {
      headers: bearer(owner),
    });
    expect(response.status()).toBe(HTTP.OK);
    const body = (await response.json()) as {
      data: { notes: string | null; active: boolean }[];
    };
    const ours = body.data.find((row) => row.notes?.includes(RUN_ID));
    expect(ours?.active).toBe(false);
  });
});
