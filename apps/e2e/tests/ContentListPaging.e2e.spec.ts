import { expect, test } from '@playwright/test';

import {
  ADMIN_COPY,
  CONTENT_LIST_PAGE_SIZE,
  contentListPath,
} from '../src/Apps.contract';
import { signInAsOwner } from '../src/Session.fixture';
import { API_PATHS } from '../src/Api.endpoints';
import { PROFILE_SLUG, RUN_ID } from '../src/E2e.constants';

const copy = ADMIN_COPY.content;
const EXTRA_ROWS = 2;
const names = Array.from(
  { length: CONTENT_LIST_PAGE_SIZE + EXTRA_ROWS },
  (_, index) => `Page-${RUN_ID}-${String(index).padStart(2, '0')}`,
);

test('sorting on page 2 returns to page 1 and clears the selection; a failed load recovers with Try again', async ({
  page,
}) => {
  const listRequests: URL[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      request.method() === 'GET' &&
      url.pathname.endsWith(API_PATHS.documents(PROFILE_SLUG))
    ) {
      listRequests.push(url);
    }
  });
  await signInAsOwner(page);
  await page.goto(contentListPath(PROFILE_SLUG));

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
  await page.route(`**/documents/${PROFILE_SLUG}?*`, (route) => {
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
