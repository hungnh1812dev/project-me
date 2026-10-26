import { expect, type Locator, type Page } from '@playwright/test';

import { ADMIN_COPY } from './Apps.contract';
import { CV_PAGE_SLUG } from './E2e.constants';

const access = ADMIN_COPY.access;

export const accountRow = (page: Page, email: string): Locator =>
  page.getByRole('row').filter({ hasText: email });

export async function openRole(page: Page, name: string): Promise<void> {
  await page.goto('/roles');
  await page.getByRole('link', { name: access.roles.open(name) }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export const permissionCell = (
  page: Page,
  action: string,
  subject: string,
): Locator =>
  page.getByRole('checkbox', {
    name: access.matrix.cellLabel(action, subject),
    exact: true,
  });

export const roleSaveButton = (page: Page): Locator =>
  page.getByRole('button', { name: access.role.save });

export const roleDiscardButton = (page: Page): Locator =>
  page.getByRole('button', { name: access.role.discard });

const readCvPageCell = (page: Page): Locator =>
  permissionCell(page, access.matrix.actions.read, CV_PAGE_SLUG);

/** Lets the Editor role read only the `position` field of cv-page. */
export async function limitEditorToPositionField(page: Page): Promise<void> {
  await openRole(page, 'Editor');
  await readCvPageCell(page).check();
  await page
    .getByRole('button', { name: access.matrix.detailsLabel(CV_PAGE_SLUG) })
    .click();
  await page.getByRole('radio', { name: access.fields.some }).check();
  await page
    .getByRole('group', { name: access.fields.readable })
    .getByRole('checkbox', { name: 'position', exact: true })
    .check();
  await roleSaveButton(page).click();
  await expect(page.getByRole('status')).toContainText('Permissions saved');
}

/** Puts the shared Editor role back to reading no cv-page. */
export async function restoreEditorRole(page: Page): Promise<void> {
  await openRole(page, 'Editor');
  await readCvPageCell(page).uncheck();
  await roleSaveButton(page).click();
  await expect(page.getByRole('status')).toBeVisible();
}
