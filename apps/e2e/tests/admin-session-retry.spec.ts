import { expect, type Page, test } from '@playwright/test';

import { ADMIN_COPY } from '../src/app-contracts';
import { API_PATHS, apiUrl } from '../src/api-paths';
import { signInAsOwner } from '../src/session';

const UNAUTHORIZED = 401;
const ACCOUNTS_URL = apiUrl(API_PATHS.ACCOUNTS);
const REFRESH_URL = apiUrl(API_PATHS.AUTH.REFRESH);

const accountsHeading = (page: Page) =>
  page.getByRole('heading', {
    level: 1,
    name: ADMIN_COPY.access.accounts.title,
  });
const loginHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title });

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
  await signInAsOwner(page);

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
    page.getByRole('button', { name: ADMIN_COPY.access.accounts.invite }),
  ).toBeVisible();
  expect(refused).toBe(1);
  // One refresh for the page start, one for the 401 - never a loop.
  expect(refreshes).toEqual([200, 200]);
});

test('a refresh the server refuses ends the session at /login', async ({
  page,
}) => {
  await signInAsOwner(page);

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
