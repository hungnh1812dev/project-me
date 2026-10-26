import type { Locator, Page } from '@playwright/test';

import { ADMIN_COPY } from './AppContracts.contract';

const content = ADMIN_COPY.content;

/** Matches a label that starts with `name` (the admin appends a required marker). */
export const labelStartingWith = (name: string): RegExp =>
  new RegExp(`^${name}`);

export const fieldByLabel = (scope: Page | Locator, label: string): Locator =>
  scope.getByLabel(label, { exact: true });

export const contentSaveButton = (page: Page): Locator =>
  page.getByRole('button', { name: content.save, exact: true });

const pageOf = (scope: Page | Locator): Page =>
  'page' in scope && typeof scope.page === 'function'
    ? scope.page()
    : (scope as Page);

/** One entry of a list field; `has` is matched per item, so it is built from the page. */
export const listItem = (
  scope: Page | Locator,
  label: string,
  index: number,
): Locator =>
  scope
    .getByRole('listitem')
    .filter({
      has: pageOf(scope).getByRole('heading', {
        name: content.list.itemTitle(label, index),
        exact: true,
      }),
    })
    .first();
