import { expect, test } from '@playwright/test';

import { e2eEnv } from '../src/E2e.env';
import { ADMIN_COPY } from '../src/Apps.contract';

/** A list shows its empty state, not a table, until the first row exists. */
const LIST_ROUTES = [
  { path: '/reviewer', empty: ADMIN_COPY.reviewer.empty },
  { path: '/roles', empty: ADMIN_COPY.access.roles.empty },
  { path: '/accounts', empty: ADMIN_COPY.access.accounts.empty },
  { path: '/api-tokens', empty: ADMIN_COPY.access.apiTokens.empty },
  { path: '/media', empty: ADMIN_COPY.media.empty },
];

test('admin list tables have no sort buttons and no selection column', async ({
  page,
}) => {
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: ADMIN_COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page
    .getByLabel(ADMIN_COPY.login.passwordLabel)
    .fill(e2eEnv.ownerPassword);
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
  await expect(
    page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
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
