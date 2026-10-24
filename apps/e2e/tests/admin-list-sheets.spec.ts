import { expect, test } from '@playwright/test';

import { e2eEnv } from '../src/env';
import { COPY } from '../../cms-admin/src/config/copy.constants';

const LIST_ROUTES = [
  '/reviewer',
  '/roles',
  '/accounts',
  '/api-tokens',
  '/media',
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

  for (const route of LIST_ROUTES) {
    await page.goto(route);
    const table = page.getByRole('table').first();
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader').first()).toBeVisible();
    await expect(table.getByRole('checkbox')).toHaveCount(0);
    await expect(
      table.getByRole('columnheader').getByRole('button'),
    ).toHaveCount(0);
  }
});
