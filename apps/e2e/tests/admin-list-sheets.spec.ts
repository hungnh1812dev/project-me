import { expect, test } from '@playwright/test';

import { e2eEnv } from '../src/env';
import { COPY } from '../../cms-admin/src/config/copy.constants';

/** A list shows its empty state, not a table, until the first row exists. */
const LIST_ROUTES = [
  { path: '/reviewer', empty: COPY.reviewer.empty },
  { path: '/roles', empty: COPY.access.roles.empty },
  { path: '/accounts', empty: COPY.access.accounts.empty },
  { path: '/api-tokens', empty: COPY.access.apiTokens.empty },
  { path: '/media', empty: COPY.media.empty },
];

test('admin list tables have no sort buttons and no selection column', async ({
  page,
}) => {
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page.getByLabel(COPY.login.passwordLabel).fill(e2eEnv.ownerPassword);
  await page.getByRole('button', { name: COPY.login.submit }).click();
  await expect(
    page.getByRole('button', { name: COPY.session.signOut }),
  ).toBeVisible();

  for (const { path, empty } of LIST_ROUTES) {
    await page.goto(path);
    const table = page.getByRole('table').first();
    await expect(table.or(page.getByText(empty))).toBeVisible();
    if ((await table.count()) === 0) continue;
    await expect(table.getByRole('columnheader').first()).toBeVisible();
    await expect(table.getByRole('checkbox')).toHaveCount(0);
    await expect(
      table.getByRole('columnheader').getByRole('button'),
    ).toHaveCount(0);
  }
});
