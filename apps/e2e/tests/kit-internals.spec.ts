import { expect, type Page, test } from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import {
  contentListPath,
  contentNewPath,
} from '../../cms-admin/src/config/routes';
import { e2eEnv } from '../src/env';

const copy = COPY.content;
const bulk = copy.bulk;
const importCopy = bulk.importDialog;
const collection = copy.collection;

const LIST_SLUG = 'profile';
const RICHTEXT_SLUG = 'cv-page';
const RUN_ID = Date.now().toString(36);
const NAMES = [`Kit-${RUN_ID}-a`, `Kit-${RUN_ID}-b`];

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

test.describe.serial('kit internals keep their rendered behaviour', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
    await signIn(page);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('list sheet: select-all is indeterminate, then checked; sort headers toggle aria-sort', async () => {
    await page.goto(contentListPath(LIST_SLUG));
    await page.getByRole('button', { name: bulk.import, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: importCopy.title });
    await dialog
      .getByLabel(importCopy.label)
      .fill(JSON.stringify(NAMES.map((name) => ({ values: { name } }))));
    await dialog.getByRole('button', { name: importCopy.submit(2) }).click();
    await expect(dialog).toBeHidden();
    for (const name of NAMES) {
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    }

    const selectAll = page.getByRole('checkbox', {
      name: collection.selectAll,
    });
    await expect(selectAll).not.toBeChecked();
    await page
      .getByRole('checkbox', { name: collection.selectRow(NAMES[0] as string) })
      .check();
    await expect(selectAll).toHaveAttribute('aria-checked', 'mixed');
    await selectAll.click();
    await expect(selectAll).toBeChecked();
    await selectAll.click();
    await expect(selectAll).not.toBeChecked();

    const sortButton = page.getByRole('button', {
      name: collection.columns.updated,
    });
    const header = page.getByRole('columnheader', {
      name: collection.columns.updated,
    });
    await sortButton.click();
    const first = await header.getAttribute('aria-sort');
    expect(['ascending', 'descending']).toContain(first);
    await sortButton.click();
    const second = await header.getAttribute('aria-sort');
    expect(['ascending', 'descending']).toContain(second);
    expect(second).not.toBe(first);
  });

  test('richtext toolbar: Bold shows pressed while the caret is in bold text', async () => {
    await page.goto(contentNewPath(RICHTEXT_SLUG));
    const toolbar = page
      .getByRole('toolbar', { name: copy.richtext.toolbar })
      .first();
    const bold = toolbar.getByRole('button', { name: copy.richtext.bold });
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.type('bold');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ControlOrMeta+A');
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
  });
});
