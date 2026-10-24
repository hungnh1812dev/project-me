import { expect, type Page, test } from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import { contentListPath } from '../../cms-admin/src/config/routes';
import { CONTENT_LIST_PAGE_SIZE } from '../../cms-admin/src/features/content/content.constants';
import { e2eEnv } from '../src/env';

const copy = COPY.content;
const SLUG = 'profile';
const RUN_ID = Date.now().toString(36);
const EXTRA_ROWS = 2;
const names = Array.from(
  { length: CONTENT_LIST_PAGE_SIZE + EXTRA_ROWS },
  (_, index) => `Page-${RUN_ID}-${String(index).padStart(2, '0')}`,
);

async function signIn(page: Page) {
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page.getByLabel(COPY.login.passwordLabel).fill(e2eEnv.ownerPassword);
  await page.getByRole('button', { name: COPY.login.submit }).click();
  await expect(
    page.getByRole('button', { name: COPY.session.signOut }),
  ).toBeVisible();
}

test('sorting on page 2 returns to page 1 and clears the selection; a failed load recovers with Try again', async ({
  page,
}) => {
  const listRequests: URL[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      request.method() === 'GET' &&
      url.pathname.endsWith(`/documents/${SLUG}`)
    ) {
      listRequests.push(url);
    }
  });
  await signIn(page);
  await page.goto(contentListPath(SLUG));

  const dialog = page.getByRole('dialog', {
    name: copy.bulk.importDialog.title,
  });
  await page
    .getByRole('button', { name: copy.bulk.import, exact: true })
    .click();
  await dialog
    .getByLabel(copy.bulk.importDialog.label)
    .fill(JSON.stringify(names.map((name) => ({ values: { name } }))));
  await dialog
    .getByRole('button', { name: copy.bulk.importDialog.submit(names.length) })
    .click();
  await expect(dialog).toBeHidden();

  await page
    .getByRole('button', { name: copy.collection.pagination.next })
    .click();
  await expect
    .poll(() => listRequests.at(-1)?.searchParams.get('page'))
    .toBe('2');
  const rows = page.getByRole('checkbox', { name: /^Select / });
  await rows.nth(0).check();
  await expect(
    page.getByRole('region', { name: copy.bulk.region }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'name' }).click();
  await expect
    .poll(() => listRequests.at(-1)?.searchParams.get('page'))
    .toBe('1');
  await expect(
    page.getByRole('region', { name: copy.bulk.region }),
  ).toBeHidden();

  // Load error, then retry.
  let failNext = true;
  await page.route(`**/documents/${SLUG}?*`, (route) => {
    if (failNext) {
      return route.fulfill({ status: 500, body: '{}' });
    }
    return route.continue();
  });
  await page.reload();
  await expect(page.getByText(copy.collection.loadFailed)).toBeVisible();
  failNext = false;
  await page.getByRole('button', { name: copy.retry }).click();
  await expect(page.getByRole('table')).toBeVisible();
});
