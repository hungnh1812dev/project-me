import { expect, test, type Locator, type Page } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { ADMIN_COPY, contentListPath, contentNewPath } from '../src/Apps.contract';
import { HTTP, PAGE_CV_A_SLUG, RUN_ID } from '../src/E2e.constants';
import {
  contentSaveButton,
  fieldByLabel,
  listItem,
  openItem,
  withItemTitleKeys,
} from '../src/Locators.fixture';
import { bearer, ownerApiToken, signInAsOwner } from '../src/Session.fixture';

const copy = ADMIN_COPY.content;
const list = copy.list;
const EDIT_URL = /\/content\/page-cv-a\/([0-9a-f-]{36})$/;
const DOCUMENTS_PATH = API_PATHS.documents(PAGE_CV_A_SLUG);
const COMPANY = `Company ${RUN_ID}`;
const HIDDEN_COMPANY = `Typed while closed ${RUN_ID}`;
const OUT_OF_RANGE_TEAM_SIZE = '99999999999999';
const SINGLE_TYPE_SLUG = 'header';
const LETTERS = 'abc';
const NON_REPEATABLE_LABEL = 'Author';

interface StoredDocument {
  components: {
    experiences?: { values: { company?: string | null }; components: { roles?: unknown[] } }[];
  };
}

const toggleOf = (scope: Page | Locator, label: string, index: number): Locator =>
  scope.getByRole('button', { name: list.itemTitle(label, index), exact: true }).first();

/** An item by its body id: its heading shows the title value once a title key is set. */
const itemWithBody = (scope: Page, label: string, index: number): Locator =>
  scope
    .getByRole('listitem')
    .filter({ has: scope.locator(`[id="${label.toLowerCase()}.${index}-body"]`) })
    .first();

const bodyOf = (scope: Page | Locator, label: string, index: number): Locator =>
  listItem(scope, label, index).locator(`[id="${label.toLowerCase()}.${index}-body"]`).first();

test.describe.serial(
  'owner: collapsible items of repeatable components',
  { tag: ['@cms-admin', '@cms-api', '@content-editing'] },
  () => {
    let page: Page;
    let documentId = '';

    test.beforeAll(async ({ browser }) => {
      page = await (await browser.newContext()).newPage();
      await signInAsOwner(page);
      await page.goto(contentNewPath(PAGE_CV_A_SLUG));
      await expect(fieldByLabel(page, 'Position')).toBeVisible();
    });

    test.afterAll(async () => {
      if (documentId !== '') {
        const token = await ownerApiToken(page.request);
        await page.request.delete(apiUrl(API_PATHS.document(PAGE_CV_A_SLUG, documentId)), {
          headers: bearer(token),
        });
      }
      await page.context().close();
    });

    const save = async () => {
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes(DOCUMENTS_PATH) && ['POST', 'PUT'].includes(r.request().method()),
        ),
        contentSaveButton(page).click(),
      ]);
      return response;
    };

    const readStored = async (): Promise<StoredDocument> => {
      const token = await ownerApiToken(page.request);
      const read = await page.request.get(
        apiUrl(`${API_PATHS.document(PAGE_CV_A_SLUG, documentId)}?status=draft`),
        { headers: bearer(token) },
      );
      expect(read.status()).toBe(HTTP.OK);
      return (await read.json()) as StoredDocument;
    };

    test('an added item opens expanded with the fallback header and a wired toggle', async () => {
      await fieldByLabel(page, 'Name').fill(`E2E collapse ${RUN_ID}`);
      await page.getByRole('button', { name: list.addSlot('Experiences') }).click();
      const toggle = toggleOf(page, 'Experiences', 0);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const bodyId = await toggle.getAttribute('aria-controls');
      expect(bodyId).toBeTruthy();
      await expect(bodyOf(page, 'Experiences', 0)).toBeVisible();
      await fieldByLabel(listItem(page, 'Experiences', 0), 'Company').fill(COMPANY);
    });

    test('click, Enter and Space toggle the item and aria-expanded follows', async () => {
      const toggle = toggleOf(page, 'Experiences', 0);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(bodyOf(page, 'Experiences', 0)).toBeHidden();

      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    test('a value typed in an item that is then collapsed is saved', async () => {
      await openItem(page, 'Experiences', 0);
      await fieldByLabel(listItem(page, 'Experiences', 0), 'Company').fill(HIDDEN_COMPANY);
      await toggleOf(page, 'Experiences', 0).click();
      await expect(bodyOf(page, 'Experiences', 0)).toBeHidden();
      await page.getByRole('button', { name: list.addSlot('Experiences') }).click();
      await expect(toggleOf(page, 'Experiences', 1)).toHaveAttribute('aria-expanded', 'true');
      await expect(toggleOf(page, 'Experiences', 0)).toHaveAttribute('aria-expanded', 'false');

      const response = await save();
      expect(response.ok()).toBe(true);
      await expect(page).toHaveURL(EDIT_URL);
      documentId = EDIT_URL.exec(page.url())?.[1] ?? '';
      const stored = await readStored();
      expect(stored.components.experiences?.[0]?.values.company).toBe(HIDDEN_COMPANY);
    });

    test('the open state survives the create-to-edit move and a move keeps it with its item', async () => {
      await expect(toggleOf(page, 'Experiences', 1)).toHaveAttribute('aria-expanded', 'true');
      await expect(toggleOf(page, 'Experiences', 0)).toHaveAttribute('aria-expanded', 'false');

      await page.getByRole('button', { name: list.moveUp('Experiences', 1) }).click();
      await expect(toggleOf(page, 'Experiences', 0)).toHaveAttribute('aria-expanded', 'true');
      await expect(toggleOf(page, 'Experiences', 1)).toHaveAttribute('aria-expanded', 'false');
      await expect(fieldByLabel(listItem(page, 'Experiences', 1), 'Company')).toHaveValue(
        HIDDEN_COMPANY,
      );
    });

    test('a save keeps the states and a reload closes every stored item', async () => {
      const response = await save();
      expect(response.ok()).toBe(true);
      await expect(toggleOf(page, 'Experiences', 0)).toHaveAttribute('aria-expanded', 'true');
      await expect(toggleOf(page, 'Experiences', 1)).toHaveAttribute('aria-expanded', 'false');

      await page.reload();
      await expect(fieldByLabel(page, 'Position')).toBeVisible();
      await expect(toggleOf(page, 'Experiences', 0)).toHaveAttribute('aria-expanded', 'false');
      await expect(toggleOf(page, 'Experiences', 1)).toHaveAttribute('aria-expanded', 'false');
      await expect(toggleOf(page, 'Experiences', 1)).toHaveAccessibleName(
        list.itemTitle('Experiences', 1),
      );
    });

    test('a refused save opens the item and its parent and keeps the others closed', async () => {
      await openItem(page, 'Experiences', 1);
      const experience = listItem(page, 'Experiences', 1);
      await experience.getByRole('button', { name: list.addSlot('Roles') }).click();
      const role = listItem(experience, 'Roles', 0);
      await fieldByLabel(role, 'Team Size').fill(OUT_OF_RANGE_TEAM_SIZE);
      await toggleOf(experience, 'Roles', 0).click();
      await toggleOf(page, 'Experiences', 1).click();
      await expect(bodyOf(page, 'Experiences', 1)).toBeHidden();

      const response = await save();
      expect(response.status()).toBe(HTTP.BAD_REQUEST);
      const body = (await response.json()) as { details?: { path?: string } };
      expect(body.details?.path).toBe(
        'components.experiences[1].components.roles[0].values.teamSize',
      );
      expect(JSON.stringify(body)).not.toContain(OUT_OF_RANGE_TEAM_SIZE);

      await expect(toggleOf(page, 'Experiences', 1)).toHaveAttribute('aria-expanded', 'true');
      await expect(toggleOf(experience, 'Roles', 0)).toHaveAttribute('aria-expanded', 'true');
      await expect(toggleOf(page, 'Experiences', 0)).toHaveAttribute('aria-expanded', 'false');
    });
  },
);

test.describe(
  'owner: a non-repeatable component has no toggle',
  { tag: ['@cms-admin', '@cms-api', '@content-editing'] },
  () => {
    test('the single type shows its component as before', async ({ page }) => {
      await signInAsOwner(page);
      await page.goto(contentListPath(SINGLE_TYPE_SLUG));
      await expect(
        page.getByRole('heading', { name: NON_REPEATABLE_LABEL, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: new RegExp(`^${NON_REPEATABLE_LABEL}( \\d+)?$`) }),
      ).toHaveCount(0);
    });
  },
);

test.describe(
  'owner: item header from titleField and a value the form refuses',
  { tag: ['@cms-admin', '@cms-api', '@content-editing'] },
  () => {
    test('the header and the toggle name follow typing; an empty title falls back', async ({
      page,
    }) => {
      await withItemTitleKeys(page, PAGE_CV_A_SLUG, 'experiences', { titleField: 'company' });
      await signInAsOwner(page);
      await page.goto(contentNewPath(PAGE_CV_A_SLUG));
      await page.getByRole('button', { name: list.addSlot('Experiences') }).click();
      const item = itemWithBody(page, 'Experiences', 0);
      await fieldByLabel(item, 'Company').fill(COMPANY);
      const header = page.getByRole('button', { name: list.itemHeader(1, COMPANY), exact: true });
      await expect(header).toBeVisible();
      await header.click();
      await expect(header).toHaveAttribute('aria-expanded', 'false');
      await header.click();
      await fieldByLabel(item, 'Company').fill('');
      await expect(toggleOf(page, 'Experiences', 0)).toBeVisible();
      await expect(page.getByRole('button', { name: list.itemHeader(1, COMPANY) })).toHaveCount(0);
    });

    test('a refused value in closed items sends no save, opens both items and focuses the input', async ({
      page,
    }) => {
      await withItemTitleKeys(page, PAGE_CV_A_SLUG, 'experiences', { titleField: 'company' });
      await signInAsOwner(page);
      await page.goto(contentNewPath(PAGE_CV_A_SLUG));
      await page.getByRole('button', { name: list.addSlot('Experiences') }).click();
      const experience = itemWithBody(page, 'Experiences', 0);
      await fieldByLabel(experience, 'Company').fill(COMPANY);
      await experience.getByRole('button', { name: list.addSlot('Roles') }).click();
      const role = listItem(experience, 'Roles', 0);
      await fieldByLabel(role, 'Team Size').fill(LETTERS);
      await toggleOf(experience, 'Roles', 0).click();
      await expect(toggleOf(experience, 'Roles', 0)).not.toContainText(LETTERS);
      await expect(toggleOf(experience, 'Roles', 0)).not.toContainText('NaN');
      const experienceToggle = page.getByRole('button', {
        name: list.itemHeader(1, COMPANY),
        exact: true,
      });
      await experienceToggle.click();
      await expect(experienceToggle).toHaveAttribute('aria-expanded', 'false');

      let saveRequests = 0;
      page.on('request', (r) => {
        if (r.url().includes(DOCUMENTS_PATH) && ['POST', 'PUT'].includes(r.method()))
          saveRequests++;
      });
      await contentSaveButton(page).click();
      await expect(experienceToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(toggleOf(experience, 'Roles', 0)).toHaveAttribute('aria-expanded', 'true');
      const teamSize = fieldByLabel(role, 'Team Size');
      await expect(teamSize).toBeFocused();
      await expect(teamSize).toHaveAttribute('aria-invalid', 'true');
      await expect(role).toContainText(copy.invalidInteger);
      expect(saveRequests).toBe(0);
    });
  },
);
