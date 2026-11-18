import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { API_PATHS } from '../src/Api.endpoints';
import { WEB_COPY } from '../src/Apps.contract';
import { REFRESH_COOKIE_NAME, WEB_SESSION_COOKIE_NAME } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { newestRefreshTokenMode } from '../src/SmokeDatabase.client';

/**
 * One reader account signed in to the admin API (ticked) and to the web (unticked): each
 * keeps its own cookie mode and its own refresh_tokens row mode. The steps change nothing
 * but sessions, so no retries.
 */
test.describe('remember modes', { tag: ['@web', '@cms-api', '@sign-in'] }, () => {
  test.describe.configure({ retries: 0 });

  const REMEMBERED_SECONDS = 2_592_000;
  const REMEMBERED_HOURS = 720;
  const UNREMEMBERED_HOURS = 12;
  const HOURS_SLACK = 0.5;
  const COOKIE_SLACK_SECONDS = 120;
  const SESSION_COOKIE_EXPIRES = -1;

  const login = WEB_COPY.login;
  const dialog = (page: Page) => page.getByRole('dialog');

  async function adminApiLogin(rememberMe: boolean) {
    const response = await fetch(`${e2eEnv.apiBaseUrl}${API_PATHS.AUTH.LOGIN}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: e2eEnv.adminUrl },
      body: JSON.stringify({
        email: e2eEnv.readerEmail,
        password: e2eEnv.readerPassword,
        rememberMe,
      }),
    });
    expect(response.status).toBe(200);
    const header = response.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    expect(header).toBeDefined();
    return header ?? '';
  }

  async function adminApiRefresh(setCookie: string) {
    const pair = setCookie.split(';')[0] ?? '';
    const response = await fetch(`${e2eEnv.apiBaseUrl}${API_PATHS.AUTH.REFRESH}`, {
      method: 'POST',
      headers: { cookie: pair, origin: e2eEnv.adminUrl },
    });
    expect(response.status).toBe(200);
    return (
      response.headers.getSetCookie().find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`)) ?? ''
    );
  }

  async function webSignIn(page: Page, remember: boolean) {
    await page.goto(e2eEnv.webUrl);
    await page.getByRole('button', { name: WEB_COPY.session.signIn, exact: true }).click();
    const form = dialog(page);
    await expect(form).toBeVisible();
    await expect(form.locator('input[name="cf-turnstile-response"]')).not.toHaveValue('');
    await form.getByRole('textbox', { name: login.emailLabel }).fill(e2eEnv.readerEmail);
    await form.getByLabel(login.passwordLabel).fill(e2eEnv.readerPassword);
    if (remember) await form.getByRole('checkbox', { name: login.rememberMeLabel }).check();
    await form.getByRole('button', { name: login.submit }).click();
    await expect(page.getByText(/^Signed in as /)).toBeVisible();
  }

  const webCookie = async (context: BrowserContext) =>
    (await context.cookies(e2eEnv.webUrl)).find(
      (cookie) => cookie.name === WEB_SESSION_COOKIE_NAME,
    );

  test('admin ticked and web unticked on one account keep their own cookie and row modes', async ({
    page,
    context,
  }) => {
    const adminCookie = await adminApiLogin(true);
    expect(adminCookie).toContain(`Max-Age=${REMEMBERED_SECONDS}`);
    const adminRow = newestRefreshTokenMode(e2eEnv.readerEmail);
    expect(adminRow.rememberMe).toBe(true);
    expect(Math.abs(adminRow.hoursAhead - REMEMBERED_HOURS)).toBeLessThan(HOURS_SLACK);

    await webSignIn(page, false);
    expect(await webCookie(context)).toMatchObject({
      expires: SESSION_COOKIE_EXPIRES,
      httpOnly: true,
    });
    const webRow = newestRefreshTokenMode(e2eEnv.readerEmail);
    expect(webRow.rememberMe).toBe(false);
    expect(Math.abs(webRow.hoursAhead - UNREMEMBERED_HOURS)).toBeLessThan(HOURS_SLACK);

    const rotated = await adminApiRefresh(adminCookie);
    expect(rotated).toContain(`Max-Age=${REMEMBERED_SECONDS}`);
    await page.reload();
    await expect(page.getByText(/^Signed in as /)).toBeVisible();
    expect(await webCookie(context)).toMatchObject({ expires: SESSION_COOKIE_EXPIRES });
    await page.getByRole('button', { name: WEB_COPY.session.signOut }).click();
  });

  test('a web sign-in ticked reaches the refresh row as a 30-day remembered token', async ({
    page,
    context,
  }) => {
    await webSignIn(page, true);
    const cookie = await webCookie(context);
    const secondsLeft = (cookie?.expires ?? 0) - Date.now() / 1000;
    expect(secondsLeft).toBeGreaterThan(REMEMBERED_SECONDS - COOKIE_SLACK_SECONDS);
    const row = newestRefreshTokenMode(e2eEnv.readerEmail);
    expect(row.rememberMe).toBe(true);
    expect(Math.abs(row.hoursAhead - REMEMBERED_HOURS)).toBeLessThan(HOURS_SLACK);
    await page.getByRole('button', { name: WEB_COPY.session.signOut }).click();
  });
});
