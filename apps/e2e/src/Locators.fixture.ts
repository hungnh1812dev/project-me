import type { Locator, Page } from '@playwright/test';

import { ADMIN_COPY } from './Apps.contract';

const content = ADMIN_COPY.content;

interface ItemTitleKeys {
  titleField: string;
  subtitleField?: string;
}

/**
 * Answers the content-type route of `slug` with the real answer plus the item title keys on the
 * component field `fieldPath`, so a header can show a child value without a schema change.
 */
export const withItemTitleKeys = async (
  page: Page,
  slug: string,
  fieldPath: string,
  keys: ItemTitleKeys,
): Promise<void> => {
  await page.route(new RegExp(`/content-types/${slug}$`), async (route) => {
    const real = await route.fetch();
    const body = (await real.json()) as { fields: { path: string }[] };
    const fields = body.fields.map((field) =>
      field.path === fieldPath ? { ...field, ...keys } : field,
    );
    await route.fulfill({ response: real, json: { ...body, fields } });
  });
};

/** Matches a label that starts with `name` (the admin appends a required marker). */
export const labelStartingWith = (name: string): RegExp => new RegExp(`^${name}`);

export const fieldByLabel = (scope: Page | Locator, label: string): Locator =>
  scope.getByLabel(label, { exact: true });

export const contentSaveButton = (page: Page): Locator =>
  page.getByRole('button', { name: content.save, exact: true });

const pageOf = (scope: Page | Locator): Page =>
  'page' in scope && typeof scope.page === 'function' ? scope.page() : (scope as Page);

/** One entry of a list field; `has` is matched per item, so it is built from the page. */
export const listItem = (scope: Page | Locator, label: string, index: number): Locator =>
  scope
    .getByRole('listitem')
    .filter({
      has: pageOf(scope).getByRole('heading', {
        name: content.list.itemTitle(label, index),
        exact: true,
      }),
    })
    .first();

/** The toggle button of one item header (its accessible name is the header text). */
const itemToggle = (scope: Page | Locator, label: string, index: number): Locator =>
  listItem(scope, label, index)
    .getByRole('button', { name: content.list.itemTitle(label, index), exact: true })
    .first();

/** Opens one item of a list field when it is closed (stored items render closed) and returns it. */
export const openItem = async (
  scope: Page | Locator,
  label: string,
  index: number,
): Promise<Locator> => {
  const toggle = itemToggle(scope, label, index);
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  return listItem(scope, label, index);
};

/** Opens every closed item of the list field `label` (nested ones included). */
export const openAllItems = async (scope: Page | Locator, label: string): Promise<void> => {
  const closed = scope
    .getByRole('region', { name: label, exact: true })
    .first()
    .locator('button[aria-expanded="false"][aria-controls]');
  while ((await closed.count()) > 0) await closed.first().click();
};

/** The toast (not the screen-reader announcement copy) whose text contains `text`. */
export const toast = (page: Page, text: string | RegExp): Locator =>
  page.locator('[data-slot="toast"]').filter({ hasText: text });
