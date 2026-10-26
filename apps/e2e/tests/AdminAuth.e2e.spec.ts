import { expect, type Page, test } from '@playwright/test';

import { ADMIN_COPY } from '../src/AppContracts.contract';
import { API_PATHS } from '../src/ApiPaths.constants';
import { REFRESH_COOKIE_NAME } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';

const homeHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: ADMIN_COPY.page.title });
const loginHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title });

/** What JS on the page can see: no token may be there (D14). */
async function browserStorage(page: Page) {
  return page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
    cookie: document.cookie,
  }));
}

test('the owner signs in, stays signed in across a reload, and signs out', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(loginHeading(page)).toBeVisible();

  await page
    .getByRole('textbox', { name: ADMIN_COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page
    .getByLabel(ADMIN_COPY.login.passwordLabel)
    .fill(e2eEnv.ownerPassword);
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();

  await expect(homeHeading(page)).toBeVisible();
  await expect(
    page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
  ).toBeVisible();

  // The refresh cookie is HttpOnly + Secure + Strict on the API host, and
  // nothing token-like is reachable from JS.
  const [refreshCookie] = (
    await context.cookies(`${e2eEnv.apiBaseUrl}${API_PATHS.AUTH.REFRESH}`)
  ).filter((cookie) => cookie.name === REFRESH_COOKIE_NAME);
  expect(refreshCookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
  });
  expect(await browserStorage(page)).toEqual({
    local: [],
    session: [],
    cookie: '',
  });

  // Reload: the in-memory token is gone; the silent refresh restores it.
  const refreshed = page.waitForResponse(
    (res) =>
      res.url() === `${e2eEnv.apiBaseUrl}${API_PATHS.AUTH.REFRESH}` &&
      res.request().method() === 'POST',
  );
  await page.reload();
  expect((await refreshed).status()).toBe(200);
  await expect(homeHeading(page)).toBeVisible();

  await page.getByRole('button', { name: ADMIN_COPY.session.signOut }).click();
  await expect(loginHeading(page)).toBeVisible();

  await page.reload();
  await expect(loginHeading(page)).toBeVisible();
  expect(
    (
      await context.cookies(`${e2eEnv.apiBaseUrl}${API_PATHS.AUTH.REFRESH}`)
    ).filter((cookie) => cookie.name === REFRESH_COOKIE_NAME),
  ).toEqual([]);
});

test('a wrong password shows the invalid-credentials message as an alert', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: ADMIN_COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page
    .getByLabel(ADMIN_COPY.login.passwordLabel)
    .fill(`${e2eEnv.ownerPassword}-wrong`);
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();

  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: ADMIN_COPY.login.errors.invalidCredentials }),
  ).toBeVisible();
  await expect(loginHeading(page)).toBeVisible();
});

const LOGIN_URL_PATTERN = '**/auth/login';
const RETRY_AFTER_SECONDS = 30;
const RETRY_AFTER_MINUTES = 3;
const SECONDS_PER_MINUTE = 60;

async function submitLogin(page: Page) {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: ADMIN_COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page.getByLabel(ADMIN_COPY.login.passwordLabel).fill('any-password-1');
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
}

const loginAlert = (page: Page, text: string) =>
  page.getByRole('alert').filter({ hasText: text });

test('a rate-limited login names the wait from Retry-After, in seconds or minutes', async ({
  page,
}) => {
  let retryAfter = String(RETRY_AFTER_SECONDS);
  await page.route(LOGIN_URL_PATTERN, (route) =>
    route.fulfill({
      status: 429,
      headers: {
        'retry-after': retryAfter,
        'access-control-expose-headers': 'Retry-After',
      },
      contentType: 'application/json',
      body: JSON.stringify({ errorCode: 'RATE_LIMITED' }),
    }),
  );

  await submitLogin(page);
  await expect(
    loginAlert(
      page,
      ADMIN_COPY.login.errors.rateLimitedSeconds(RETRY_AFTER_SECONDS),
    ),
  ).toBeVisible();

  retryAfter = String(RETRY_AFTER_MINUTES * SECONDS_PER_MINUTE);
  await page.getByLabel(ADMIN_COPY.login.passwordLabel).fill('any-password-1');
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
  await expect(
    loginAlert(
      page,
      ADMIN_COPY.login.errors.rateLimitedMinutes(RETRY_AFTER_MINUTES),
    ),
  ).toBeVisible();
});

test('a login that cannot reach the API shows the network message', async ({
  page,
}) => {
  await page.route(LOGIN_URL_PATTERN, (route) => route.abort('failed'));
  await submitLogin(page);
  await expect(loginAlert(page, ADMIN_COPY.login.errors.network)).toBeVisible();
  await expect(loginHeading(page)).toBeVisible();
});

test('any other 4xx on login shows the one generic invalid-credentials message', async ({
  page,
}) => {
  await page.route(LOGIN_URL_PATTERN, (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ errorCode: 'ACCOUNT_LOCKED' }),
    }),
  );
  await submitLogin(page);
  await expect(
    loginAlert(page, ADMIN_COPY.login.errors.invalidCredentials),
  ).toBeVisible();
});
