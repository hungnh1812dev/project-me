import { type BrowserContext, expect, test } from '@playwright/test';

import { ADMIN_COPY, WEB_COPY } from '../src/AppContracts.contract';
import { API_PATHS } from '../src/ApiPaths.constants';
import { NOTES_MAX_LENGTH } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { labelStartingWith } from '../src/Locators.fixture';
import { RUN_ID } from '../src/RunId.constants';
import {
  dialog,
  next,
  openButton,
  reachNotesStep,
  reviewerAdminCopy as admin,
  reviewerCopy as copy,
  setEnabled,
  step,
  submit,
  TURNSTILE_HOST,
} from '../src/ReviewerDialog.fixture';
import { clearReviewerSessions } from '../src/SmokeDatabase.client';
import { ownerApiToken, signInAs } from '../src/Session.fixture';

/**
 * Reviewer access, web dialog (anonymous visitor): the switch, step
 * validation, the Turnstile failure states and the switched-off refusal.
 * Sessions are created in ReviewerSession.e2e.spec.ts.
 */
test.describe.configure({ mode: 'serial', retries: 0 });

const OTHER_ROLE = `Auditor ${RUN_ID}`;
const OTHER_PURPOSE = `Audit ${RUN_ID}`;

test.describe('reviewer access: web dialog', () => {
  let context: BrowserContext;
  let owner: string;

  test.beforeAll(async ({ browser, playwright }) => {
    clearReviewerSessions();
    context = await browser.newContext();
    const api = await playwright.request.newContext();
    owner = await ownerApiToken(api);
    await setEnabled(api, owner, false);
    await api.dispose();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('switch off: no Reviewer access button on the web', async () => {
    const page = await context.newPage();
    const status = page.waitForResponse((response) =>
      response.url().endsWith(API_PATHS.REVIEWER.STATUS),
    );
    await page.goto(e2eEnv.webUrl);
    expect(await (await status).json()).toEqual({ enabled: false });
    await expect(
      page.getByRole('button', { name: WEB_COPY.session.signIn }),
    ).toBeVisible();
    await expect(openButton(page)).toHaveCount(0);
    await page.close();
  });

  test('owner switches reviewer access on in the admin; the web offers the button, and a failing status hides it', async () => {
    const adminPage = await context.newPage();
    await signInAs(adminPage, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
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
      page.getByRole('button', { name: WEB_COPY.session.signIn }),
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
      if (
        req.method() === 'POST' &&
        req.url().endsWith(API_PATHS.REVIEWER.SESSIONS)
      ) {
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
      .getByLabel(labelStartingWith(copy.role.label))
      .selectOption(copy.role.other);
    await next(page).click();
    await expect(
      dialog(page).getByText(copy.validation.roleOtherRequired),
    ).toBeVisible();
    const other = dialog(page).getByLabel(
      labelStartingWith(copy.role.otherLabel),
    );
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
    const purpose = dialog(page).getByLabel(
      labelStartingWith(copy.purposes.otherLabel),
    );
    await purpose.fill(OTHER_PURPOSE);
    await next(page).click();
    await expect(step(page, 3)).toBeVisible();
    expect(posted).toBe(0);

    // Step 3: notes over the limit, then no verification.
    const notes = dialog(page).getByLabel(labelStartingWith(copy.notes.label));
    await notes.fill('x'.repeat(NOTES_MAX_LENGTH + 1));
    await submit(page).click();
    await expect(
      dialog(page).getByText(copy.validation.notesTooLong(NOTES_MAX_LENGTH)),
    ).toBeVisible();
    await notes.fill('x'.repeat(NOTES_MAX_LENGTH));
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
      .getByLabel(labelStartingWith(copy.role.label))
      .selectOption('Recruiter');
    await next(page).click();
    await dialog(page).getByLabel(copy.purposes.other, { exact: true }).check();
    await dialog(page)
      .getByLabel(labelStartingWith(copy.purposes.otherLabel))
      .fill(OTHER_PURPOSE);
    await dialog(page)
      .getByLabel(labelStartingWith(copy.purposes.otherLabel))
      .press('Enter');
    await expect(step(page, 3)).toBeVisible();
    await page.close();
  });

  test('Enter on step 2 moves on when the role is Other and the purpose is Other', async () => {
    const page = await context.newPage();
    await page.goto(e2eEnv.webUrl);
    await openButton(page).click();
    await dialog(page)
      .getByLabel(labelStartingWith(copy.role.label))
      .selectOption(copy.role.other);
    await dialog(page)
      .getByLabel(labelStartingWith(copy.role.otherLabel))
      .fill(OTHER_ROLE);
    await next(page).click();
    await dialog(page).getByLabel(copy.purposes.other, { exact: true }).check();
    const purpose = dialog(page).getByLabel(
      labelStartingWith(copy.purposes.otherLabel),
    );
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

  test('Back keeps the answers, an expired check shows its message, and Back discards the token', async () => {
    const page = await context.newPage();
    // A stand-in Turnstile that lets the test pass and expire the check.
    await page.route(TURNSTILE_HOST, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `window.turnstile = {
          render: (_el, options) => { window.turnstileOptions = options; return 'w'; },
          remove: () => {},
          reset: () => {},
        };`,
      }),
    );
    let posted = 0;
    page.on('request', (req) => {
      if (
        req.method() === 'POST' &&
        req.url().endsWith(API_PATHS.REVIEWER.SESSIONS)
      ) {
        posted += 1;
      }
    });
    await page.goto(e2eEnv.webUrl);
    await openButton(page).click();
    await dialog(page)
      .getByLabel(labelStartingWith(copy.role.label))
      .selectOption('Recruiter');
    await next(page).click();
    await dialog(page).getByLabel(copy.purposes.other, { exact: true }).check();
    await dialog(page)
      .getByLabel(labelStartingWith(copy.purposes.otherLabel))
      .fill(OTHER_PURPOSE);
    await next(page).click();
    await expect(step(page, 3)).toBeVisible();
    await dialog(page)
      .getByLabel(labelStartingWith(copy.notes.label))
      .fill('kept notes');

    const fire = (callback: 'callback' | 'expired-callback') =>
      page.evaluate((name) => {
        const options = (
          window as unknown as {
            turnstileOptions: Record<string, (token?: string) => void>;
          }
        ).turnstileOptions;
        options[name]?.('stub-token');
      }, callback);

    await fire('callback');
    await fire('expired-callback');
    await expect(dialog(page).getByText(copy.turnstile.expired)).toBeVisible();
    await submit(page).click();
    await expect(dialog(page).getByText(copy.turnstile.required)).toBeVisible();
    expect(posted).toBe(0);

    await fire('callback');
    await dialog(page).getByRole('button', { name: copy.back }).click();
    await expect(
      dialog(page).getByLabel(labelStartingWith(copy.purposes.otherLabel)),
    ).toHaveValue(OTHER_PURPOSE);
    await dialog(page).getByRole('button', { name: copy.back }).click();
    await expect(
      dialog(page).getByLabel(labelStartingWith(copy.role.label)),
    ).toHaveValue('Recruiter');
    await next(page).click();
    await next(page).click();
    await expect(
      dialog(page).getByLabel(labelStartingWith(copy.notes.label)),
    ).toHaveValue('kept notes');
    // The token from before Back is gone: submitting needs a new check.
    await submit(page).click();
    await expect(dialog(page).getByText(copy.turnstile.required)).toBeVisible();
    expect(posted).toBe(0);
    await page.close();
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
    await expect(page.getByText(WEB_COPY.session.reviewing)).toHaveCount(0);
    await page.close();
  });

  test('a role without reviewer settings sees no Reviewers nav and a forbidden note on /reviewer', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInAs(page, e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword);
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
