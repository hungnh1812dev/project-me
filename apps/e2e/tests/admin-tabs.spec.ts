import { expect, type Page, test } from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import { AUTH_REFRESH_PATH } from '../src/constants';
import { e2eEnv } from '../src/env';

const homeHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: COPY.page.title });
const loginHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: COPY.login.title });

/** Statuses of every refresh call the page makes from now on. */
function recordRefreshes(page: Page): number[] {
  const statuses: number[] = [];
  page.on('response', (res) => {
    if (
      res.url() === `${e2eEnv.apiBaseUrl}${AUTH_REFRESH_PATH}` &&
      res.request().method() === 'POST'
    ) {
      statuses.push(res.status());
    }
  });
  return statuses;
}

test('two admin tabs that refresh at the same moment both stay signed in (T11a)', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page.getByLabel(COPY.login.passwordLabel).fill(e2eEnv.ownerPassword);
  await page.getByRole('button', { name: COPY.login.submit }).click();
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

  await page.getByRole('button', { name: COPY.session.signOut }).click();
  await expect(loginHeading(page)).toBeVisible();
});
