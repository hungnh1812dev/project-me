import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { BFF_PATHS, isCmsApiRequest } from '../src/Api.endpoints';
import { WEB_COPY } from '../src/Apps.contract';
import { WEB_SESSION_COOKIE_NAME, WEB_TWO_FACTOR_COOKIE_NAME } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { mailIdsFor, waitForCode } from '../src/Mailpit.client';
import { countActiveRefreshTokens } from '../src/SmokeDatabase.client';

/**
 * apps/web sign-in dialog and the BFF session (sealed HttpOnly cookie; the browser calls only /api/v1 on the web origin). Only reader accounts
 * (role guest, no permission) may hold a web session; owner / admin / editor
 * are refused. Self-contained: it uses the seeded reader accounts and the
 * owner, reads no state from other specs (the smoke stack lifts the login
 * limits, so spec order spends no shared login budget). The steps change
 * nothing but sessions, so no retries.
 */
test.describe('web session', { tag: ['@web', '@cms-api', '@sign-in'] }, () => {
  test.describe.configure({ retries: 0 });

  const login = WEB_COPY.login;
  const withCount = (template: string, count: number) => template.replace('{count}', String(count));
  const headerSignIn = (page: Page) =>
    page.getByRole('button', { name: WEB_COPY.session.signIn, exact: true });
  const dialog = (page: Page) => page.getByRole('dialog');

  const TWO_FACTOR_COOKIE_MAX_AGE_SECONDS = 300;
  const COOKIE_AGE_SLACK_SECONDS = 30;

  const EMPTY_STORAGE = { local: [], session: [], cookie: '' };
  const storageState = (page: Page) =>
    page.evaluate(() => ({
      local: Object.keys(window.localStorage),
      session: Object.keys(window.sessionStorage),
      cookie: document.cookie,
    }));

  const hostCookie = async (context: BrowserContext, name: string) =>
    (await context.cookies(e2eEnv.webUrl)).find((cookie) => cookie.name === name);
  const readSessionUser = async (page: Page) =>
    (
      (await (await page.request.get(`${e2eEnv.webUrl}${BFF_PATHS.SESSION}`)).json()) as {
        user: unknown;
      }
    ).user;

  async function openDialog(page: Page): Promise<void> {
    await headerSignIn(page).click();
    await expect(page.getByRole('dialog', { name: login.title })).toBeVisible();
  }

  /** The widget fills a hidden input when its token is ready; a submit before that does nothing. */
  async function waitForHumanCheck(page: Page): Promise<void> {
    await expect(dialog(page).locator('input[name="cf-turnstile-response"]')).not.toHaveValue('');
  }

  async function fillCredentials(
    page: Page,
    email: string,
    password: string,
    options: { remember?: boolean } = {},
  ): Promise<void> {
    const form = dialog(page);
    await waitForHumanCheck(page);
    await form.getByRole('textbox', { name: login.emailLabel }).fill(email);
    await form.getByLabel(login.passwordLabel).fill(password);
    // Ticked after the fields are filled: a blur error above the box would shift it under the pointer.
    if (options.remember) await form.getByRole('checkbox', { name: login.rememberMeLabel }).check();
    await form.getByRole('button', { name: login.submit }).click();
  }

  const signOutButton = (page: Page) =>
    page.getByRole('button', { name: WEB_COPY.session.signOut });

  test('anonymous visit shows Sign in; the dialog validates, closes with Esc and Cancel, and reopens clean', async ({
    page,
  }) => {
    const session = page.waitForResponse((res) => res.url().endsWith(BFF_PATHS.SESSION));
    await page.goto(e2eEnv.webUrl);
    expect((await session).status()).toBe(200);
    await expect(headerSignIn(page)).toBeVisible();
    await expect(signOutButton(page)).toHaveCount(0);
    // Next's route announcer is an empty role=alert; only alerts with text count.
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);

    await openDialog(page);
    await waitForHumanCheck(page);
    await dialog(page).getByRole('button', { name: login.submit }).click();
    await expect(dialog(page).getByText(login.validation.emailRequired)).toBeVisible();
    await dialog(page).getByRole('textbox', { name: login.emailLabel }).fill('not-an-email');
    await dialog(page).getByLabel(login.passwordLabel).fill('x');
    await waitForHumanCheck(page);
    await dialog(page).getByRole('button', { name: login.submit }).click();
    await expect(dialog(page).getByText(login.validation.emailInvalid)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);

    await openDialog(page);
    await expect(dialog(page).getByRole('textbox', { name: login.emailLabel })).toHaveValue('');
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
    await expect(dialog(page).getByText(login.errors.invalidCredentials)).toBeVisible();
    await expect(dialog(page).getByLabel(login.passwordLabel)).toHaveValue('');
    await expect(dialog(page).getByRole('textbox', { name: login.emailLabel })).toHaveValue(email);
  });

  test('a reader signs in on the web, stays signed in on reload, and signs out', async ({
    page,
    context,
  }) => {
    const requests: string[] = [];
    const cmsApiRequests: string[] = [];
    page.on('request', (req) => {
      requests.push(new URL(req.url()).pathname);
      if (isCmsApiRequest(req.url())) cmsApiRequests.push(req.url());
    });

    await page.goto(e2eEnv.webUrl);
    await openDialog(page);
    const loginResponse = page.waitForResponse((res) => res.url().endsWith(BFF_PATHS.AUTH.LOGIN));
    await fillCredentials(page, e2eEnv.readerEmail, e2eEnv.readerPassword);
    expect(await (await loginResponse).text()).not.toMatch(/token/i);
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText(/^Signed in as /)).toBeVisible();
    await expect(signOutButton(page)).toBeVisible();
    await expect(headerSignIn(page)).toHaveCount(0);

    // Every browser call of the web origin goes to the BFF; none reaches cms-api.
    expect(cmsApiRequests).toEqual([]);
    const authPaths = requests.filter((path) => path.startsWith(BFF_PATHS.AUTH.LOGIN));
    expect(authPaths.length).toBeGreaterThan(0);

    const cookies = (await context.cookies(e2eEnv.webUrl)).filter(
      (cookie) => cookie.name === WEB_SESSION_COOKIE_NAME,
    );
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
    });
    expect(await storageState(page)).toEqual(EMPTY_STORAGE);

    // The "Open CMS" link needs NEXT_PUBLIC_ADMIN_URL, which the smoke stack leaves unset.
    await expect(page.getByRole('link', { name: WEB_COPY.session.openCms })).toHaveCount(0);

    await page.reload();
    await expect(page.getByText(/^Signed in as /)).toBeVisible();

    // One changed character in the sealed cookie reads signed out and the cookie is cleared.
    const sealed = await hostCookie(context, WEB_SESSION_COOKIE_NAME);
    expect(await readSessionUser(page)).not.toBeNull();
    // A middle character changes the sealed bytes for sure; a trailing one can fall in base64 padding bits.
    const middle = Math.floor(sealed!.value.length / 2);
    const flipped = sealed!.value[middle] === 'A' ? 'B' : 'A';
    const tampered = `${sealed!.value.slice(0, middle)}${flipped}${sealed!.value.slice(middle + 1)}`;
    await context.addCookies([{ ...sealed!, value: tampered }]);
    expect(await readSessionUser(page)).toBeNull();
    expect(await hostCookie(context, WEB_SESSION_COOKIE_NAME)).toBeUndefined();
    await context.addCookies([sealed!]);
    await page.reload();
    await expect(page.getByText(/^Signed in as /)).toBeVisible();

    // A failing sign-out keeps the session and says so.
    const failLogout = `**${BFF_PATHS.AUTH.LOGOUT}`;
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

  const REMEMBERED_SECONDS = 2_592_000;
  const REMEMBERED_SLACK_SECONDS = 120;
  const SESSION_COOKIE_EXPIRES = -1;
  const rememberBox = (page: Page) =>
    dialog(page).getByRole('checkbox', { name: login.rememberMeLabel });

  test('the keep-me-signed-in box is unticked on every open; unticked sets a session cookie, ticked about 30 days, both survive a reload', async ({
    page,
    context,
  }) => {
    await page.goto(e2eEnv.webUrl);
    await openDialog(page);
    await expect(rememberBox(page)).not.toBeChecked();
    await expect(dialog(page).getByText(login.rememberMeHint)).toBeVisible();
    await rememberBox(page).focus();
    await page.keyboard.press('Space');
    await expect(rememberBox(page)).toBeChecked();
    await page.keyboard.press('Escape');
    await openDialog(page);
    await expect(rememberBox(page)).not.toBeChecked();
    // A reopened dialog keeps its human check on "Loading"; a fresh page gives a ready one.
    await page.reload();
    await openDialog(page);

    await fillCredentials(page, e2eEnv.readerEmail, e2eEnv.readerPassword);
    await expect(page.getByText(/^Signed in as /)).toBeVisible();
    expect(await hostCookie(context, WEB_SESSION_COOKIE_NAME)).toMatchObject({
      expires: SESSION_COOKIE_EXPIRES,
      httpOnly: true,
      secure: true,
    });
    await page.reload();
    await expect(page.getByText(/^Signed in as /)).toBeVisible();
    expect(await hostCookie(context, WEB_SESSION_COOKIE_NAME)).toMatchObject({
      expires: SESSION_COOKIE_EXPIRES,
    });
    expect(await storageState(page)).toEqual(EMPTY_STORAGE);
    await signOutButton(page).click();
    await expect(headerSignIn(page)).toBeVisible();

    await openDialog(page);
    await fillCredentials(page, e2eEnv.readerEmail, e2eEnv.readerPassword, { remember: true });
    await expect(page.getByText(/^Signed in as /)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/^Signed in as /)).toBeVisible();
    const cookie = await hostCookie(context, WEB_SESSION_COOKIE_NAME);
    expect(cookie).toMatchObject({ httpOnly: true, secure: true });
    const secondsLeft = (cookie?.expires ?? 0) - Date.now() / 1000;
    expect(secondsLeft).toBeGreaterThan(REMEMBERED_SECONDS - REMEMBERED_SLACK_SECONDS);
    expect(secondsLeft).toBeLessThanOrEqual(REMEMBERED_SECONDS);
    expect(await storageState(page)).toEqual(EMPTY_STORAGE);
    await signOutButton(page).click();
    await expect(headerSignIn(page)).toBeVisible();
  });

  test('a ticked box on the credentials step is kept through the code step', async ({
    page,
    context,
  }) => {
    await page.goto(e2eEnv.webUrl);
    await openDialog(page);
    const seen = await mailIdsFor(context, e2eEnv.reader2faEmail);
    await fillCredentials(page, e2eEnv.reader2faEmail, e2eEnv.reader2faPassword, {
      remember: true,
    });
    const step = page.getByRole('dialog', { name: login.twoFactor.title });
    await expect(step).toBeVisible();
    const code = await waitForCode(context, e2eEnv.reader2faEmail, seen);
    await step.getByLabel(new RegExp(`^${login.twoFactor.emailLabel}`)).fill(code);
    await waitForHumanCheck(page);
    await step.getByRole('button', { name: login.twoFactor.submit }).click();
    await expect(page.getByText(/^Signed in as /)).toBeVisible();
    const cookie = await hostCookie(context, WEB_SESSION_COOKIE_NAME);
    const secondsLeft = (cookie?.expires ?? 0) - Date.now() / 1000;
    expect(secondsLeft).toBeGreaterThan(REMEMBERED_SECONDS - REMEMBERED_SLACK_SECONDS);
    await signOutButton(page).click();
    await expect(headerSignIn(page)).toBeVisible();
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

    // The code-step cookie is short-lived and host-only, and is not a session when swapped in.
    const twoFactor = await hostCookie(context, WEB_TWO_FACTOR_COOKIE_NAME);
    expect(twoFactor).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
    });
    expect(twoFactor?.domain.startsWith('.')).toBe(false);
    const secondsLeft = (twoFactor?.expires ?? 0) - Date.now() / 1000;
    expect(secondsLeft).toBeGreaterThan(
      TWO_FACTOR_COOKIE_MAX_AGE_SECONDS - COOKIE_AGE_SLACK_SECONDS,
    );
    expect(secondsLeft).toBeLessThanOrEqual(TWO_FACTOR_COOKIE_MAX_AGE_SECONDS);
    expect(await hostCookie(context, WEB_SESSION_COOKIE_NAME)).toBeUndefined();
    await context.addCookies([{ ...twoFactor!, name: WEB_SESSION_COOKIE_NAME }]);
    expect(await readSessionUser(page)).toBeNull();
    expect(await hostCookie(context, WEB_SESSION_COOKIE_NAME)).toBeUndefined();

    const codeInput = step.getByLabel(new RegExp(`^${login.twoFactor.emailLabel}`));

    // Empty and short codes are blocked on the client.
    await waitForHumanCheck(page);
    await step.getByRole('button', { name: login.twoFactor.submit }).click();
    await expect(step.getByText(login.twoFactor.codeInvalid)).toBeVisible();
    await codeInput.fill('123');
    await waitForHumanCheck(page);
    await step.getByRole('button', { name: login.twoFactor.submit }).click();
    await expect(step.getByText(login.twoFactor.codeInvalid)).toBeVisible();

    // A wrong code gets the message and clears the field.
    await codeInput.fill('000000');
    await waitForHumanCheck(page);
    await step.getByRole('button', { name: login.twoFactor.submit }).click();
    await expect(step.getByText(login.twoFactor.errors.invalidCode)).toBeVisible();
    await expect(codeInput).toHaveValue('');

    const code = await waitForCode(context, e2eEnv.reader2faEmail, seen);
    await codeInput.fill(code);
    await waitForHumanCheck(page);
    await step.getByRole('button', { name: login.twoFactor.submit }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText(/^Signed in as /)).toBeVisible();
    await signOutButton(page).click();
    await expect(headerSignIn(page)).toBeVisible();
  });

  test('sign-out revokes the refresh token at cms-api', async ({ page }) => {
    await page.goto(e2eEnv.webUrl);
    await openDialog(page);
    const activeBefore = countActiveRefreshTokens(e2eEnv.readerEmail);
    await fillCredentials(page, e2eEnv.readerEmail, e2eEnv.readerPassword);
    await expect(page.getByText(/^Signed in as /)).toBeVisible();
    expect(countActiveRefreshTokens(e2eEnv.readerEmail)).toBe(activeBefore + 1);

    await signOutButton(page).click();
    await expect(headerSignIn(page)).toBeVisible();
    expect(countActiveRefreshTokens(e2eEnv.readerEmail)).toBe(activeBefore);
  });

  const rateLimitedBody = { errorCode: 'BFF_RATE_LIMITED' };

  test('a rate-limited sign-in names the wait in seconds or minutes, and an offline server shows the network warning', async ({
    page,
  }) => {
    const loginRoute = `**${BFF_PATHS.AUTH.LOGIN}`;
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
      dialog(page).getByText(withCount(login.errors.rateLimitedSecondsOther, 30)),
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
    await waitForHumanCheck(page);
    await dialog(page).getByRole('button', { name: login.submit }).click();
    await expect(
      dialog(page).getByText(withCount(login.errors.rateLimitedMinutesOther, 2)),
    ).toBeVisible();

    await page.unroute(loginRoute);
    await page.route(loginRoute, (route) => route.fulfill({ status: 429, json: rateLimitedBody }));
    await dialog(page).getByLabel(login.passwordLabel).fill('x');
    await waitForHumanCheck(page);
    await dialog(page).getByRole('button', { name: login.submit }).click();
    await expect(dialog(page).getByText(login.errors.rateLimited)).toBeVisible();

    await page.unroute(loginRoute);
    await page.route(loginRoute, (route) => route.abort('connectionrefused'));
    await dialog(page).getByLabel(login.passwordLabel).fill('x');
    await waitForHumanCheck(page);
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

    await page.route(`**${BFF_PATHS.AUTH.TWO_FACTOR_EMAIL_CODE}`, (route) =>
      route.fulfill({
        status: 429,
        headers: { 'retry-after': '45' },
        json: rateLimitedBody,
      }),
    );
    await waitForHumanCheck(page);
    await step.getByRole('button', { name: login.twoFactor.resend }).click();
    await expect(step.getByText(withCount(login.errors.rateLimitedSecondsOther, 45))).toBeVisible();

    await page.route(`**${BFF_PATHS.AUTH.TWO_FACTOR_VERIFY}`, (route) =>
      route.fulfill({
        status: 401,
        json: { errorCode: 'BFF_TWO_FACTOR_EXPIRED' },
      }),
    );
    await step.getByLabel(new RegExp(`^${login.twoFactor.emailLabel}`)).fill('123456');
    await waitForHumanCheck(page);
    await step.getByRole('button', { name: login.twoFactor.submit }).click();
    await expect(dialog(page).getByText(login.twoFactor.expired)).toBeVisible();
    await expect(dialog(page).getByRole('textbox', { name: login.emailLabel })).toBeVisible();
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

    const challengeRoute = `**${BFF_PATHS.AUTH.TWO_FACTOR_EMAIL_CODE}`;
    await page.route(challengeRoute, (route) =>
      route.fulfill({
        status: 429,
        headers: { 'retry-after': String(SHORT_RETRY_AFTER_SECONDS) },
        json: rateLimitedBody,
      }),
    );
    await waitForHumanCheck(page);
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
    await waitForHumanCheck(page);
    await resend.click();
    await expect(resend).toBeDisabled();
    await page.waitForTimeout(COOLDOWN_SETTLE_MS);
    await expect(resend).toBeDisabled();
  });
});
