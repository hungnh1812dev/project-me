import { expect, type Page, test } from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import { AUTH_REFRESH_PATH } from '../src/constants';
import { e2eEnv } from '../src/env';

const UNAUTHORIZED = 401;
const ACCOUNTS_URL = `${e2eEnv.apiBaseUrl}/accounts`;
const REFRESH_URL = `${e2eEnv.apiBaseUrl}${AUTH_REFRESH_PATH}`;

const accountsHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: COPY.access.accounts.title });
const loginHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: COPY.login.title });

async function signIn(page: Page) {
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page.getByLabel(COPY.login.passwordLabel).fill(e2eEnv.ownerPassword);
  await page.getByRole('button', { name: COPY.login.submit }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: COPY.page.title }),
  ).toBeVisible();
}

function recordRefreshes(page: Page): number[] {
  const statuses: number[] = [];
  page.on('response', (res) => {
    if (res.url() === REFRESH_URL && res.request().method() === 'POST') {
      statuses.push(res.status());
    }
  });
  return statuses;
}

test('a 401 on a protected call refreshes once and retries it', async ({
  page,
}) => {
  await signIn(page);

  let refused = 0;
  await page.route(
    (url) => url.href.startsWith(ACCOUNTS_URL),
    (route) => {
      if (route.request().method() === 'GET' && refused === 0) {
        refused += 1;
        return route.fulfill({ status: UNAUTHORIZED, json: {} });
      }
      return route.continue();
    },
  );
  const refreshes = recordRefreshes(page);

  await page.goto('/accounts');
  await expect(accountsHeading(page)).toBeVisible();
  await expect(
    page.getByRole('button', { name: COPY.access.accounts.invite }),
  ).toBeVisible();
  expect(refused).toBe(1);
  // One refresh for the page start, one for the 401 - never a loop.
  expect(refreshes).toEqual([200, 200]);
});

test('a refresh the server refuses ends the session at /login', async ({
  page,
}) => {
  await signIn(page);

  await page.route(
    (url) => url.href.startsWith(ACCOUNTS_URL),
    (route) => route.fulfill({ status: UNAUTHORIZED, json: {} }),
  );
  let startRefreshDone = false;
  await page.route(REFRESH_URL, (route) => {
    if (route.request().method() !== 'POST' || !startRefreshDone) {
      startRefreshDone = true;
      return route.continue();
    }
    return route.fulfill({ status: UNAUTHORIZED, json: {} });
  });

  await page.goto('/accounts');
  await expect(loginHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
