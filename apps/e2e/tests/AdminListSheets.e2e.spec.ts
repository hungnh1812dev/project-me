import { expect, test } from '@playwright/test';

import { ADMIN_COPY } from '../src/Apps.contract';
import { e2eEnv } from '../src/E2e.env';
import { expectSignedIn } from '../src/Session.fixture';

/** A list shows its empty state, not a table, until the first row exists. */
const LIST_ROUTES = [
  { path: '/reviewer', empty: ADMIN_COPY.reviewer.empty },
  { path: '/roles', empty: ADMIN_COPY.access.roles.empty },
  { path: '/accounts', empty: ADMIN_COPY.access.accounts.empty },
  { path: '/api-tokens', empty: ADMIN_COPY.access.apiTokens.empty },
  { path: '/media', empty: ADMIN_COPY.media.empty, grid: ADMIN_COPY.media.grid.label },
];

test.describe('admin list sheets', { tag: ['@cms-admin', '@cms-api'] }, () => {
  test('admin list tables have no sort buttons and no selection column', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: ADMIN_COPY.login.emailLabel }).fill(e2eEnv.ownerEmail);
    await page.getByLabel(ADMIN_COPY.login.passwordLabel).fill(e2eEnv.ownerPassword);
    await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
    await expectSignedIn(page);

    for (const { path, empty, ...rest } of LIST_ROUTES) {
      await page.goto(path);
      const table = page.getByRole('table').first();
      // A library with files shows a grid, not a table.
      const grid = 'grid' in rest ? page.getByRole('list', { name: rest.grid }) : table;
      await expect(table.or(grid).or(page.getByText(empty))).toBeVisible();
      if ((await table.count()) === 0) continue;
      await expect(table.getByRole('columnheader').first()).toBeVisible();
      await expect(table.getByRole('checkbox')).toHaveCount(0);
      await expect(table.getByRole('columnheader').getByRole('button')).toHaveCount(0);
    }
  });
});
