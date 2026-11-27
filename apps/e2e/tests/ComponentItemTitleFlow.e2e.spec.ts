import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { ADMIN_COPY, contentNewPath } from '../src/Apps.contract';
import { HTTP, PAGE_CV_A_SLUG, RUN_ID } from '../src/E2e.constants';
import {
  contentSaveButton,
  fieldByLabel,
  listItem,
  withItemTitleKeys,
} from '../src/Locators.fixture';
import { bearer, ownerApiToken, signInAsOwner } from '../src/Session.fixture';

const builder = ADMIN_COPY.schemaBuilder;
const content = ADMIN_COPY.content;
const list = content.list;
const SCHEMA_URL = new URL('../../cms-api/content/schemas/page-cv-a.json', import.meta.url);
const COMPANY = `Company ${RUN_ID}`;
const LOCATION = `Place ${RUN_ID}`;
const LETTERS = 'abc';
const OUT_OF_RANGE_TEAM_SIZE = '99999999999999';
const DOCUMENTS_PATH = API_PATHS.documents(PAGE_CV_A_SLUG);

interface FieldDefinition {
  name: string;
  titleField?: string;
  subtitleField?: string;
}
interface Definition {
  fields: FieldDefinition[];
}

const propertiesDialog = (page: Page) =>
  page.getByRole('dialog').filter({
    has: page.getByRole('button', { name: builder.property.done, exact: true }),
  });

/** Phase A: sets title and subtitle in the builder popup and returns the downloaded JSON. */
const exportWithKeys = async (page: Page): Promise<Definition> => {
  await page.goto('/schema-builder');
  await page.getByRole('button', { name: builder.start.importJson }).click();
  const importDialog = page.getByRole('dialog', { name: builder.import.title });
  await importDialog.getByLabel(builder.import.textLabel).fill(readFileSync(SCHEMA_URL, 'utf8'));
  await importDialog.getByRole('button', { name: builder.import.submit }).click();
  await page.getByRole('button', { name: builder.row.select('experiences'), exact: true }).click();
  const dialog = propertiesDialog(page);
  await dialog.getByLabel(builder.property.itemTitleField).selectOption({ label: 'company' });
  await dialog.getByLabel(builder.property.itemSubtitleField).selectOption({ label: 'location' });
  await dialog.getByRole('button', { name: builder.property.done, exact: true }).click();
  await expect(page.getByText(builder.validation.valid, { exact: true })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: builder.export.download }).click(),
  ]);
  return JSON.parse(readFileSync(await download.path(), 'utf8')) as Definition;
};

test.describe.serial(
  'owner: builder keys reach the validate route and the document form',
  { tag: ['@cms-admin', '@cms-api', '@schema-builder', '@content-editing'] },
  () => {
    let page: Page;
    let keys: { titleField: string; subtitleField: string };

    test.beforeAll(async ({ browser }) => {
      page = await (await browser.newContext()).newPage();
      await signInAsOwner(page);
    });

    test.afterAll(async () => {
      await page.context().close();
    });

    test('the keys the builder exports are accepted by validate as written', async () => {
      const exported = await exportWithKeys(page);
      const experiences = exported.fields.find((field) => field.name === 'experiences');
      expect(experiences?.titleField).toBe('company');
      expect(experiences?.subtitleField).toBe('location');
      keys = { titleField: 'company', subtitleField: 'location' };

      const token = await ownerApiToken(page.request);
      const answer = await page.request.post(apiUrl(API_PATHS.CONTENT_TYPES_VALIDATE), {
        data: { definition: exported, mode: 'update' },
        headers: bearer(token),
      });
      expect(answer.status()).toBe(HTTP.OK);
      expect(await answer.json()).toEqual({ valid: true, errors: [] });
    });

    test('the form header shows title and subtitle, follows typing and keeps the toggle name', async () => {
      await withItemTitleKeys(page, PAGE_CV_A_SLUG, 'experiences', keys);
      await page.goto(contentNewPath(PAGE_CV_A_SLUG));
      await page.getByRole('button', { name: list.addSlot('Experiences') }).click();
      const item = page
        .getByRole('listitem')
        .filter({ has: page.locator('[id="experiences.0-body"]') })
        .first();
      await fieldByLabel(item, 'Company').fill(COMPANY);
      await fieldByLabel(item, 'Location').fill(LOCATION);
      const header = page.getByRole('button', {
        name: `${list.itemHeader(1, COMPANY)} - ${LOCATION}`,
        exact: true,
      });
      await expect(header).toBeVisible();
      await fieldByLabel(item, 'Location').fill('');
      await expect(
        page.getByRole('button', { name: list.itemHeader(1, COMPANY), exact: true }),
      ).toBeVisible();
    });

    test('a refused value keeps the header, sends no save and opens the item chain', async () => {
      await withItemTitleKeys(page, PAGE_CV_A_SLUG, 'experiences', keys);
      await page.goto(contentNewPath(PAGE_CV_A_SLUG));
      await page.getByRole('button', { name: list.addSlot('Experiences') }).click();
      const item = page
        .getByRole('listitem')
        .filter({ has: page.locator('[id="experiences.0-body"]') })
        .first();
      await fieldByLabel(item, 'Company').fill(COMPANY);
      await fieldByLabel(item, 'Location').fill(LOCATION);
      await item.getByRole('button', { name: list.addSlot('Roles') }).click();
      const role = listItem(item, 'Roles', 0);
      await fieldByLabel(role, 'Team Size').fill(LETTERS);
      await role.getByRole('button', { name: list.itemTitle('Roles', 0), exact: true }).click();
      const headerName = `${list.itemHeader(1, COMPANY)} - ${LOCATION}`;
      const header = page.getByRole('button', { name: headerName, exact: true });
      await header.click();
      await expect(header).toHaveAttribute('aria-expanded', 'false');

      let saveRequests = 0;
      page.on('request', (r) => {
        if (r.url().includes(DOCUMENTS_PATH) && ['POST', 'PUT'].includes(r.method()))
          saveRequests++;
      });
      await contentSaveButton(page).click();
      await expect(header).toHaveAttribute('aria-expanded', 'true');
      await expect(fieldByLabel(role, 'Team Size')).toBeFocused();
      await expect(header).not.toContainText('NaN');
      await expect(header).not.toContainText(LETTERS);
      expect(saveRequests).toBe(0);

      await fieldByLabel(role, 'Team Size').fill(OUT_OF_RANGE_TEAM_SIZE);
      await role.getByRole('button', { name: list.itemTitle('Roles', 0), exact: true }).click();
      await header.click();
      await expect(header).toHaveAttribute('aria-expanded', 'false');
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes(DOCUMENTS_PATH) && r.request().method() === 'POST',
        ),
        contentSaveButton(page).click(),
      ]);
      expect(response.status()).toBe(HTTP.BAD_REQUEST);
      await expect(header).toHaveAttribute('aria-expanded', 'true');
      await expect(header).toHaveText(new RegExp(`${COMPANY} - ${LOCATION}`));
    });
  },
);
