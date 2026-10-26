import { expect, type Page, test } from '@playwright/test';

import { ADMIN_COPY, contentListPath } from '../src/AppContracts.contract';
import { e2eEnv } from '../src/E2e.env';
import { PROFILE_SLUG, RUN_ID } from '../src/E2e.constants';
import { signInAs } from '../src/Session.fixture';
import { API_PATHS } from '../src/Api.endpoints';

const copy = ADMIN_COPY.content;
const bulk = copy.bulk;
const dialogCopy = bulk.importDialog;
const collection = copy.collection;

const BULK_PATH = API_PATHS.documentsBulk(PROFILE_SLUG);
const SAMPLE_SIZE = 5;
const MAX_ITEMS = 50;
const names = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}-${RUN_ID}-${index}`);
const toJson = (values: string[]) =>
  JSON.stringify(values.map((name) => ({ values: { name } })));

const importDialog = (page: Page) =>
  page.getByRole('dialog', { name: dialogCopy.title });
const payload = (page: Page) => importDialog(page).getByLabel(dialogCopy.label);
const rowBox = (page: Page, name: string) =>
  page.getByRole('checkbox', { name: collection.selectRow(name) });
const bar = (page: Page) => page.getByRole('region', { name: bulk.region });
const statusText = (page: Page, text: string | RegExp) =>
  page.getByText(text).first();

async function importNames(page: Page, values: string[]) {
  await page.getByRole('button', { name: bulk.import, exact: true }).click();
  await payload(page).fill(toJson(values));
  await importDialog(page)
    .getByRole('button', { name: dialogCopy.submit(values.length) })
    .click();
  await expect(importDialog(page)).toBeHidden();
  await expect(
    statusText(page, dialogCopy.created(values.length)),
  ).toBeVisible();
  for (const name of values) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  }
}

async function selectAll(page: Page, values: string[]) {
  for (const name of values) await rowBox(page, name).check();
}

test.describe
  .serial('owner: collection list and bulk actions (profile)', () => {
  let page: Page;
  const consoleProblems: string[] = [];
  const set = names('Bulk', SAMPLE_SIZE);

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !message.text().startsWith('Failed to load resource')
      ) {
        consoleProblems.push(message.text());
      }
    });
    page.on('pageerror', (error) => consoleProblems.push(error.message));
    await signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
    await page.goto(contentListPath(PROFILE_SLUG));
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: collection.title(PROFILE_SLUG),
      }),
    ).toBeVisible();
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('import creates documents; sortable headers and paging controls render', async () => {
    await importNames(page, set);
    await expect(
      page.getByRole('button', { name: collection.columns.updated }),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: collection.pagination.label }),
    ).toBeVisible();
  });

  test('select 5 and publish: summary, published list, selection cleared', async () => {
    await selectAll(page, set);
    await expect(bar(page)).toContainText(bulk.selected(SAMPLE_SIZE));
    await page
      .getByRole('button', { name: bulk.publish(SAMPLE_SIZE), exact: true })
      .click();
    await expect(
      statusText(page, bulk.summary.publish(SAMPLE_SIZE, SAMPLE_SIZE)),
    ).toBeVisible();
    await expect(bar(page)).toBeHidden();
    await expect(rowBox(page, set[0] as string)).not.toBeChecked();
  });

  test('unpublish: never-published rows are listed as failures and stay selected', async () => {
    const fresh = names('Fresh', 2);
    await importNames(page, fresh);
    const mixed = [set[0] as string, set[1] as string, ...fresh];
    await selectAll(page, mixed);
    await page
      .getByRole('button', { name: bulk.unpublish(mixed.length), exact: true })
      .click();
    await expect(
      statusText(page, bulk.summary.unpublish(2, mixed.length)),
    ).toBeVisible();
    await expect(
      page.getByText(bulk.summary.failedHeading(2), { exact: true }),
    ).toBeVisible();
    for (const name of fresh) {
      await expect(
        page.getByText(
          bulk.summary.failedItem(name, bulk.itemErrors.notPublished),
        ),
      ).toBeVisible();
      await expect(rowBox(page, name)).toBeChecked();
    }
    await expect(rowBox(page, set[0] as string)).not.toBeChecked();
    await page.getByRole('button', { name: bulk.clear }).click();
  });

  test('a stale list: publishing a changed document names the conflict, retry succeeds', async () => {
    const target = set[2] as string;
    const other = await page.context().newPage();
    await other.goto(contentListPath(PROFILE_SLUG));
    await other.getByRole('link', { name: target, exact: true }).click();
    const nameField = other.getByLabel('Name', { exact: true });
    await expect(nameField).toHaveValue(target);
    const renamed = `${target}-edited`;
    await nameField.fill(renamed);
    await other.getByRole('button', { name: copy.save, exact: true }).click();
    await expect(other.getByText(copy.saved)).toBeVisible();
    await other.close();

    await rowBox(page, target).check();
    await page
      .getByRole('button', { name: bulk.publish(1), exact: true })
      .click();
    await expect(
      page.getByText(bulk.summary.failedItem(target, bulk.itemErrors.conflict)),
    ).toBeVisible();
    await expect(rowBox(page, target)).toBeChecked();

    await page.reload();
    await expect(
      page.getByRole('link', { name: renamed, exact: true }),
    ).toBeVisible();
    await rowBox(page, renamed).check();
    await page
      .getByRole('button', { name: bulk.publish(1), exact: true })
      .click();
    await expect(statusText(page, bulk.summary.publish(1, 1))).toBeVisible();
  });

  test('delete asks first: Cancel and Escape delete nothing, confirm removes rows', async () => {
    const victims = [set[3] as string, set[4] as string];
    await selectAll(page, victims);
    const deleteButton = page.getByRole('button', {
      name: bulk.delete(2),
      exact: true,
    });
    await deleteButton.click();
    const dialog = page.getByRole('dialog', {
      name: bulk.deleteDialog.title(2),
    });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('button', { name: bulk.deleteDialog.cancel })
      .click();
    await expect(dialog).toBeHidden();
    for (const name of victims) await expect(rowBox(page, name)).toBeChecked();

    await deleteButton.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    for (const name of victims) {
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    }

    await deleteButton.click();
    await dialog
      .getByRole('button', { name: bulk.deleteDialog.confirm(2) })
      .click();
    await expect(statusText(page, bulk.summary.delete(2, 2))).toBeVisible();
    for (const name of victims) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(
        0,
      );
    }
  });

  test('import: invalid input shows an inline error and sends no request', async () => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(BULK_PATH)) requests.push(request.url());
    });
    await page.getByRole('button', { name: bulk.import, exact: true }).click();
    const dialog = importDialog(page);
    const submit = dialog.locator('button[type="submit"]');
    const cases: [string, string][] = [
      ['{not json', dialogCopy.invalidJson],
      ['{"values":{}}', dialogCopy.notArray],
      ['[]', dialogCopy.empty],
      [
        JSON.stringify(
          Array.from({ length: MAX_ITEMS + 1 }, () => ({ values: {} })),
        ),
        dialogCopy.tooMany(MAX_ITEMS),
      ],
    ];
    for (const [text, message] of cases) {
      await payload(page).fill(text);
      await submit.click();
      await expect(dialog.getByText(message)).toBeVisible();
    }
    expect(requests).toHaveLength(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('import partial: failed item is listed and the text keeps only it', async () => {
    const good = names('Good', 1)[0] as string;
    await page.getByRole('button', { name: bulk.import, exact: true }).click();
    const dialog = importDialog(page);
    await payload(page).fill(
      JSON.stringify([
        { values: { name: good } },
        { values: { name: ['not', 'a', 'string'] } },
      ]),
    );
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.getByText(dialogCopy.partial(1, 1))).toBeVisible();
    await expect(dialog.getByText(/^Item 2: /)).toBeVisible();
    const left = JSON.parse(await payload(page).inputValue()) as unknown[];
    expect(left).toHaveLength(1);
    await dialog.getByRole('button', { name: dialogCopy.cancel }).click();
    await expect(dialog).toBeHidden();
  });

  test('import all-or-nothing: a failing item creates nothing', async () => {
    const good = names('Atomic', 1)[0] as string;
    await page.getByRole('button', { name: bulk.import, exact: true }).click();
    const dialog = importDialog(page);
    await payload(page).fill(
      JSON.stringify([
        { values: { name: good } },
        { values: { name: ['bad'] } },
      ]),
    );
    await dialog.getByLabel(dialogCopy.atomic).check();
    await dialog.locator('button[type="submit"]').click();
    await expect(
      dialog.getByText(/^Nothing was created\. Item 2: /),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(
      page.getByRole('link', { name: good, exact: true }),
    ).toHaveCount(0);
  });

  test('an unknown slug shows the not-found message', async () => {
    await page.goto(contentListPath('does-not-exist'));
    await expect(page.getByText(copy.typeNotFound)).toBeVisible();
  });

  test('no console errors', () => {
    expect(consoleProblems).toEqual([]);
  });

  test('closing the delete dialog with Escape returns focus to the Delete button', async () => {
    await page.goto(contentListPath(PROFILE_SLUG));
    const [only] = names('Focus', 1) as [string];
    await importNames(page, [only]);
    await rowBox(page, only).check();
    const deleteButton = page.getByRole('button', {
      name: bulk.delete(1),
      exact: true,
    });
    await deleteButton.click();
    const dialog = page.getByRole('dialog', {
      name: bulk.deleteDialog.title(1),
    });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(deleteButton).toBeFocused();
  });
});

test.describe('role without content permissions', () => {
  test('no import, new-document button or checkboxes', async ({ page }) => {
    await signInAs(page, e2eEnv.readerEmail, e2eEnv.readerPassword);
    await page.goto(contentListPath(PROFILE_SLUG));
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: collection.title(PROFILE_SLUG),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: bulk.import, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: collection.newDocument }),
    ).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });
});
