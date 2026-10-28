import { expect, type Page, test } from '@playwright/test';

import { ADMIN_COPY } from '../src/Apps.contract';
import { API_PATHS } from '../src/Api.endpoints';
import { e2eEnv } from '../src/E2e.env';

const homeHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: ADMIN_COPY.page.title });
const loginHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title });

/** Statuses of every refresh call the page makes from now on. */
function recordRefreshes(page: Page): number[] {
  const statuses: number[] = [];
  page.on('response', (res) => {
    if (
      res.url() === `${e2eEnv.apiBaseUrl}${API_PATHS.AUTH.REFRESH}` &&
      res.request().method() === 'POST'
    ) {
      statuses.push(res.status());
    }
  });
  return statuses;
}

test('two admin tabs that refresh at the same moment both stay signed in', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: ADMIN_COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page
    .getByLabel(ADMIN_COPY.login.passwordLabel)
    .fill(e2eEnv.ownerPassword);
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
  await expect(homeHeading(page)).toBeVisible();

  // Second tab: same browser context, so the same refresh cookie.
  const second = await context.newPage();
  await second.goto('/');
  await expect(homeHeading(second)).toBeVisible();

  // Both tabs restart at once: each one's silent refresh races the other's.
  const firstStatuses = recordRefreshes(page);
  const secondStatuses = recordRefreshes(second);
  await Promise.all([page.reload(), second.reload()]);
  await expect(homeHeading(page)).toBeVisible();
  await expect(homeHeading(second)).toBeVisible();
  const raced = [...firstStatuses, ...secondStatuses];
  expect(raced.length).toBeGreaterThan(0);
  expect(raced.every((status) => status === 200)).toBe(true);

  // The token family survived: a later refresh still works in either tab.
  await second.reload();
  await expect(homeHeading(second)).toBeVisible();
  await page.reload();
  await expect(homeHeading(page)).toBeVisible();

  await page.getByRole('button', { name: ADMIN_COPY.session.signOut }).click();
  await expect(loginHeading(page)).toBeVisible();
});
