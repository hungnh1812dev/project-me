import { expect, type Page, test } from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import { AUTH_REFRESH_PATH, REFRESH_COOKIE_NAME } from '../src/constants';
import { e2eEnv } from '../src/env';

const homeHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: COPY.page.title });
const loginHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: COPY.login.title });

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
    .getByRole('textbox', { name: COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page.getByLabel(COPY.login.passwordLabel).fill(e2eEnv.ownerPassword);
  await page.getByRole('button', { name: COPY.login.submit }).click();

  await expect(homeHeading(page)).toBeVisible();
  await expect(
    page.getByRole('button', { name: COPY.session.signOut }),
  ).toBeVisible();

  // The refresh cookie is HttpOnly + Secure + Strict on the API host, and
  // nothing token-like is reachable from JS.
  const [refreshCookie] = (
    await context.cookies(`${e2eEnv.apiBaseUrl}${AUTH_REFRESH_PATH}`)
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
      res.url() === `${e2eEnv.apiBaseUrl}${AUTH_REFRESH_PATH}` &&
      res.request().method() === 'POST',
  );
  await page.reload();
  expect((await refreshed).status()).toBe(200);
  await expect(homeHeading(page)).toBeVisible();

  await page.getByRole('button', { name: COPY.session.signOut }).click();
  await expect(loginHeading(page)).toBeVisible();

  await page.reload();
  await expect(loginHeading(page)).toBeVisible();
  expect(
    (await context.cookies(`${e2eEnv.apiBaseUrl}${AUTH_REFRESH_PATH}`)).filter(
      (cookie) => cookie.name === REFRESH_COOKIE_NAME,
    ),
  ).toEqual([]);
});
