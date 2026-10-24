import { expect, type Page, test } from '@playwright/test';

import { ADMIN_COPY, WEB_COPY } from '../src/app-contracts';
import { API_PATHS } from '../src/api-paths';
import { REFRESH_COOKIE_NAME } from '../src/constants';
import { e2eEnv } from '../src/env';
import { mailIdsFor, waitForCode } from '../src/mailpit';

/**
 * apps/web sign-in dialog and in-memory session. Only reader accounts
 * (role guest, no permission) may hold a web session; owner / admin / editor
 * are refused. Self-contained: it uses the seeded reader accounts and the
 * owner, reads no state from other specs (the smoke stack lifts the login
 * limits, so spec order spends no shared login budget). The steps change
 * nothing but sessions, so no retries.
 */
test.describe.configure({ retries: 0 });

const login = WEB_COPY.login;
const headerSignIn = (page: Page) =>
  page.getByRole('button', { name: WEB_COPY.session.signIn, exact: true });
const dialog = (page: Page) => page.getByRole('dialog');

const EMPTY_STORAGE = { local: [], session: [], cookie: '' };
const storageState = (page: Page) =>
  page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
    cookie: document.cookie,
  }));

async function openDialog(page: Page): Promise<void> {
  await headerSignIn(page).click();
  await expect(page.getByRole('dialog', { name: login.title })).toBeVisible();
}

async function fillCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const form = dialog(page);
  await form.getByRole('textbox', { name: login.emailLabel }).fill(email);
  await form.getByLabel(login.passwordLabel).fill(password);
  await form.getByRole('button', { name: login.submit }).click();
}

const signOutButton = (page: Page) =>
  page.getByRole('button', { name: WEB_COPY.session.signOut });

test('anonymous visit shows Sign in; the dialog validates, closes with Esc and Cancel, and reopens clean', async ({
  page,
}) => {
  const refresh = page.waitForResponse((res) =>
    res.url().endsWith(API_PATHS.AUTH.REFRESH),
  );
  await page.goto(e2eEnv.webUrl);
  expect((await refresh).status()).toBe(401);
  await expect(headerSignIn(page)).toBeVisible();
  await expect(signOutButton(page)).toHaveCount(0);
  // Next's route announcer is an empty role=alert; only alerts with text count.
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(
    0,
  );

  await openDialog(page);
  await dialog(page).getByRole('button', { name: login.submit }).click();
  await expect(
    dialog(page).getByText(login.validation.emailRequired),
  ).toBeVisible();
  await dialog(page)
    .getByRole('textbox', { name: login.emailLabel })
    .fill('not-an-email');
  await dialog(page).getByLabel(login.passwordLabel).fill('x');
  await dialog(page).getByRole('button', { name: login.submit }).click();
  await expect(
    dialog(page).getByText(login.validation.emailInvalid),
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  await openDialog(page);
  await expect(
    dialog(page).getByRole('textbox', { name: login.emailLabel }),
  ).toHaveValue('');
  await dialog(page).getByRole('button', { name: login.cancel }).click();
  await expect(dialog(page)).toHaveCount(0);
});

test('a wrong password shows one generic message, clears the password and keeps the email', async ({
  page,
}) => {
  const email = `nobody@${new URL(e2eEnv.webUrl).hostname}`;
  await page.goto(e2eEnv.webUrl);
  await openDialog(page);
  await fillCredentials(page, email, 'definitely-wrong-password');
  await expect(
    dialog(page).getByText(login.errors.invalidCredentials),
  ).toBeVisible();
  await expect(dialog(page).getByLabel(login.passwordLabel)).toHaveValue('');
  await expect(
    dialog(page).getByRole('textbox', { name: login.emailLabel }),
  ).toHaveValue(email);
});

test('a reader signs in on the web, stays signed in on reload, shares the session with the admin, and signs out', async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  page.on('request', (req) => requests.push(new URL(req.url()).pathname));

  await page.goto(e2eEnv.webUrl);
  await openDialog(page);
  await fillCredentials(page, e2eEnv.readerEmail, e2eEnv.readerPassword);
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByText(/^Signed in as /)).toBeVisible();
  await expect(signOutButton(page)).toBeVisible();
  await expect(headerSignIn(page)).toHaveCount(0);

  // Auth goes to the API only, never through a Next route.
  const authPaths = requests.filter((path) =>
    path.includes(API_PATHS.AUTH_PREFIX),
  );
  expect(authPaths.length).toBeGreaterThan(0);
  for (const path of authPaths) expect(path).toMatch(/^\/api\/v1\/auth\//);

  const cookies = (
    await context.cookies(`${e2eEnv.apiBaseUrl}${API_PATHS.AUTH.REFRESH}`)
  ).filter((cookie) => cookie.name === REFRESH_COOKIE_NAME);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/api/v1/auth',
  });
  expect(await storageState(page)).toEqual(EMPTY_STORAGE);

  // The "Open CMS" link needs NEXT_PUBLIC_ADMIN_URL, which the smoke stack leaves unset.
  await expect(
    page.getByRole('link', { name: WEB_COPY.session.openCms }),
  ).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(/^Signed in as /)).toBeVisible();

  // The same cookie restores the session on the admin origin.
  const admin = await context.newPage();
  await admin.goto(e2eEnv.adminUrl);
  await expect(
    admin.getByRole('button', { name: ADMIN_COPY.session.signOut }),
  ).toBeVisible();
  await admin.close();

  // A failing sign-out keeps the session and says so.
  const failLogout = '**/auth/logout';
  await page.route(failLogout, (route) => route.fulfill({ status: 500 }));
  await signOutButton(page).click();
  await expect(page.getByText(WEB_COPY.session.signOutFailed)).toBeVisible();
  await expect(signOutButton(page)).toBeVisible();
  await expect(headerSignIn(page)).toHaveCount(0);
  await page.unroute(failLogout);

  await signOutButton(page).click();
  await expect(headerSignIn(page)).toBeVisible();
  await page.reload();
  await expect(headerSignIn(page)).toBeVisible();
  await expect(signOutButton(page)).toHaveCount(0);
});

test('the owner is refused on the web: the dialog says to use the admin, the page stays anonymous and holds no token', async ({
  page,
}) => {
  await page.goto(e2eEnv.webUrl);
  await openDialog(page);
  await fillCredentials(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  await expect(dialog(page).getByText(login.errors.privileged)).toBeVisible();
  await expect(page.getByText(/^Signed in as /)).toHaveCount(0);
  await expect(signOutButton(page)).toHaveCount(0);
  expect(await storageState(page)).toEqual(EMPTY_STORAGE);

  // The refresh cookie may still exist, but the refreshed privileged token is dropped.
  await page.keyboard.press('Escape');
  await expect(headerSignIn(page)).toBeVisible();
  await page.reload();
  await expect(headerSignIn(page)).toBeVisible();
  await expect(signOutButton(page)).toHaveCount(0);
  await expect(page.getByText(/^Signed in as /)).toHaveCount(0);
});

test('a reader with email codes signs in on the web through the code step', async ({
  page,
  context,
}) => {
  await page.goto(e2eEnv.webUrl);
  await openDialog(page);
  const seen = await mailIdsFor(context, e2eEnv.reader2faEmail);
  await fillCredentials(page, e2eEnv.reader2faEmail, e2eEnv.reader2faPassword);

  const step = page.getByRole('dialog', { name: login.twoFactor.title });
  await expect(step).toBeVisible();
  await expect(step.getByText(login.twoFactor.emailWarning)).toBeVisible();
  const codeInput = step.getByLabel(
    new RegExp(`^${login.twoFactor.emailLabel}`),
  );

  // Empty and short codes are blocked on the client.
  await step.getByRole('button', { name: login.twoFactor.submit }).click();
  await expect(step.getByText(login.twoFactor.codeInvalid)).toBeVisible();
  await codeInput.fill('123');
  await step.getByRole('button', { name: login.twoFactor.submit }).click();
  await expect(step.getByText(login.twoFactor.codeInvalid)).toBeVisible();

  // A wrong code gets the message and clears the field.
  await codeInput.fill('000000');
  await step.getByRole('button', { name: login.twoFactor.submit }).click();
  await expect(
    step.getByText(login.twoFactor.errors.invalidCode),
  ).toBeVisible();
  await expect(codeInput).toHaveValue('');

  const code = await waitForCode(context, e2eEnv.reader2faEmail, seen);
  await codeInput.fill(code);
  await step.getByRole('button', { name: login.twoFactor.submit }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByText(/^Signed in as /)).toBeVisible();
  await signOutButton(page).click();
  await expect(headerSignIn(page)).toBeVisible();
});

const rateLimitedBody = { errorCode: 'RATE_LIMITED' };

test('a rate-limited sign-in names the wait in seconds or minutes, and an offline server shows the network warning', async ({
  page,
}) => {
  const loginRoute = '**/auth/login';
  await page.goto(e2eEnv.webUrl);
  await openDialog(page);

  await page.route(loginRoute, (route) =>
    route.fulfill({
      status: 429,
      headers: { 'retry-after': '30' },
      json: rateLimitedBody,
    }),
  );
  await fillCredentials(page, e2eEnv.readerEmail, 'x');
  await expect(
    dialog(page).getByText(login.errors.rateLimitedSeconds(30)),
  ).toBeVisible();

  await page.unroute(loginRoute);
  await page.route(loginRoute, (route) =>
    route.fulfill({
      status: 429,
      headers: { 'retry-after': '120' },
      json: rateLimitedBody,
    }),
  );
  await dialog(page).getByLabel(login.passwordLabel).fill('x');
  await dialog(page).getByRole('button', { name: login.submit }).click();
  await expect(
    dialog(page).getByText(login.errors.rateLimitedMinutes(2)),
  ).toBeVisible();

  await page.unroute(loginRoute);
  await page.route(loginRoute, (route) =>
    route.fulfill({ status: 429, json: rateLimitedBody }),
  );
  await dialog(page).getByLabel(login.passwordLabel).fill('x');
  await dialog(page).getByRole('button', { name: login.submit }).click();
  await expect(dialog(page).getByText(login.errors.rateLimited)).toBeVisible();

  await page.unroute(loginRoute);
  await page.route(loginRoute, (route) => route.abort('connectionrefused'));
  await dialog(page).getByLabel(login.passwordLabel).fill('x');
  await dialog(page).getByRole('button', { name: login.submit }).click();
  await expect(dialog(page).getByText(login.errors.network)).toBeVisible();
  await expect(page.getByText(/^Signed in as /)).toHaveCount(0);
});

test('the code step: a dead temp token returns to the credentials with a notice, and a rate-limited resend names the wait', async ({
  page,
  context,
}) => {
  await page.goto(e2eEnv.webUrl);
  await openDialog(page);
  const seen = await mailIdsFor(context, e2eEnv.reader2faEmail);
  await fillCredentials(page, e2eEnv.reader2faEmail, e2eEnv.reader2faPassword);
  const step = page.getByRole('dialog', { name: login.twoFactor.title });
  await expect(step).toBeVisible();
  await waitForCode(context, e2eEnv.reader2faEmail, seen);

  await page.route('**/auth/2fa/email-challenge', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'retry-after': '45' },
      json: rateLimitedBody,
    }),
  );
  await step.getByRole('button', { name: login.twoFactor.resend }).click();
  await expect(
    step.getByText(login.errors.rateLimitedSeconds(45)),
  ).toBeVisible();

  await page.route('**/auth/2fa/verify', (route) =>
    route.fulfill({
      status: 401,
      json: { errorCode: 'AUTH_INVALID_TEMP_TOKEN' },
    }),
  );
  await step
    .getByLabel(new RegExp(`^${login.twoFactor.emailLabel}`))
    .fill('123456');
  await step.getByRole('button', { name: login.twoFactor.submit }).click();
  await expect(dialog(page).getByText(login.twoFactor.expired)).toBeVisible();
  await expect(
    dialog(page).getByRole('textbox', { name: login.emailLabel }),
  ).toBeVisible();
  await expect(page.getByText(/^Signed in as /)).toHaveCount(0);
});

const HUGE_RETRY_AFTER_SECONDS = 3_000_000;
const SHORT_RETRY_AFTER_SECONDS = 2;
const COOLDOWN_SETTLE_MS = 1500;

test('the code step: a resend after a 429 stays blocked for a huge Retry-After and frees after a short one', async ({
  page,
  context,
}) => {
  await page.goto(e2eEnv.webUrl);
  await openDialog(page);
  const seen = await mailIdsFor(context, e2eEnv.reader2faEmail);
  await fillCredentials(page, e2eEnv.reader2faEmail, e2eEnv.reader2faPassword);
  const step = page.getByRole('dialog', { name: login.twoFactor.title });
  await expect(step).toBeVisible();
  await waitForCode(context, e2eEnv.reader2faEmail, seen);
  const resend = step.getByRole('button', { name: login.twoFactor.resend });

  const challengeRoute = '**/auth/2fa/email-challenge';
  await page.route(challengeRoute, (route) =>
    route.fulfill({
      status: 429,
      headers: { 'retry-after': String(SHORT_RETRY_AFTER_SECONDS) },
      json: rateLimitedBody,
    }),
  );
  await resend.click();
  await expect(resend).toBeDisabled();
  await expect(resend).toBeEnabled({ timeout: COOLDOWN_SETTLE_MS * 4 });

  await page.unroute(challengeRoute);
  await page.route(challengeRoute, (route) =>
    route.fulfill({
      status: 429,
      headers: { 'retry-after': String(HUGE_RETRY_AFTER_SECONDS) },
      json: rateLimitedBody,
    }),
  );
  await resend.click();
  await expect(resend).toBeDisabled();
  await page.waitForTimeout(COOLDOWN_SETTLE_MS);
  await expect(resend).toBeDisabled();
});

test('a signed-in reader gets no Reviewer access button and no reviewer status call', async ({
  page,
}) => {
  await page.goto(e2eEnv.webUrl);
  await openDialog(page);
  const statusCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().endsWith(API_PATHS.REVIEWER.STATUS))
      statusCalls.push(req.url());
  });
  await fillCredentials(page, e2eEnv.readerEmail, e2eEnv.readerPassword);
  await expect(signOutButton(page)).toBeVisible();
  await expect(
    page.getByRole('button', { name: WEB_COPY.reviewer.open, exact: true }),
  ).toHaveCount(0);
  expect(statusCalls).toEqual([]);
});
