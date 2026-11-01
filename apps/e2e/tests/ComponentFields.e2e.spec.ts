import { expect, test, type Page } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { ADMIN_COPY, contentNewPath } from '../src/Apps.contract';
import { CV_PAGE_SLUG, HTTP, RUN_ID } from '../src/E2e.constants';
import { contentSaveButton, fieldByLabel, listItem } from '../src/Locators.fixture';
import { bearer, ownerApiToken, signInAsOwner } from '../src/Session.fixture';

const copy = ADMIN_COPY.content;
const list = copy.list;
const EDIT_URL = /\/content\/cv-page\/([0-9a-f-]{36})$/;
const DOCUMENTS_PATH = API_PATHS.documents(CV_PAGE_SLUG);
const POSITION = `E2E components ${RUN_ID}`;
const NAMES = [`Alpha ${RUN_ID}`, `Beta ${RUN_ID}`, `Gamma ${RUN_ID}`] as const;
const ROLE_NAME = `Role ${RUN_ID}`;

interface StoredItem {
  componentUid?: string;
  values: { skill?: string };
  components: { role?: unknown[] };
}
interface StoredDocument {
  components: { skill?: StoredItem[]; experience?: StoredItem[] };
}

const addSlot = (scope: Page | ReturnType<typeof listItem>, label: string) =>
  scope.getByRole('button', { name: list.addSlot(label), exact: true });

const skillName = (page: Page, index: number) =>
  fieldByLabel(listItem(page, 'Skill', index), 'Skill');

const names = async (page: Page, count: number) => {
  const found: string[] = [];
  for (let index = 0; index < count; index += 1) {
    found.push(await skillName(page, index).inputValue());
  }
  return found;
};

test.describe.serial('owner: component fields (dashed slots, remove, move)', () => {
  let page: Page;
  let documentId = '';
  let uidsBeforeEdit: Record<string, string | undefined> = {};

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
    await signInAsOwner(page);
    await page.goto(contentNewPath(CV_PAGE_SLUG));
    await expect(fieldByLabel(page, 'Position')).toBeVisible();
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  const readStored = async (): Promise<StoredDocument> => {
    const token = await ownerApiToken(page.request);
    const read = await page.request.get(
      apiUrl(`${API_PATHS.document(CV_PAGE_SLUG, documentId)}?status=draft`),
      { headers: bearer(token) },
    );
    expect(read.status()).toBe(HTTP.OK);
    return (await read.json()) as StoredDocument;
  };

  const save = async () => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(DOCUMENTS_PATH) && ['POST', 'PUT'].includes(r.request().method()),
      ),
      contentSaveButton(page).click(),
    ]);
    expect(response.ok()).toBe(true);
  };

  test('the empty slot adds an item on click, Enter and Space', async () => {
    const slot = addSlot(page, 'Skill');
    await expect(slot).toBeVisible();
    await expect(listItem(page, 'Skill', 0)).toHaveCount(0);

    await slot.click();
    await expect(listItem(page, 'Skill', 0)).toBeVisible();
    await slot.focus();
    await page.keyboard.press('Enter');
    await expect(listItem(page, 'Skill', 1)).toBeVisible();
    await slot.focus();
    await page.keyboard.press('Space');
    await expect(listItem(page, 'Skill', 2)).toBeVisible();

    for (const [index, name] of NAMES.entries()) {
      await skillName(page, index).fill(name);
    }
    await fieldByLabel(page, 'Position').fill(POSITION);
  });

  test('ends are disabled and the focus follows the moved item', async () => {
    await expect(page.getByRole('button', { name: list.moveUp('Skill', 0) })).toBeDisabled();
    await expect(page.getByRole('button', { name: list.moveDown('Skill', 2) })).toBeDisabled();

    await page.getByRole('button', { name: list.moveDown('Skill', 0) }).focus();
    await page.keyboard.press('Enter');
    expect(await names(page, 3)).toEqual([NAMES[1], NAMES[0], NAMES[2]]);
    await expect(page.getByRole('button', { name: list.moveDown('Skill', 1) })).toBeFocused();

    // The item reached the bottom: focus moves to the enabled opposite control.
    await page.keyboard.press('Enter');
    expect(await names(page, 3)).toEqual([NAMES[1], NAMES[2], NAMES[0]]);
    await expect(page.getByRole('button', { name: list.moveUp('Skill', 2) })).toBeFocused();
  });

  test('tab order per item is remove, up, down, then the next item and the slot', async () => {
    await page.getByRole('button', { name: list.remove('Skill', 1) }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: list.moveUp('Skill', 1) })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: list.moveDown('Skill', 1) })).toBeFocused();
  });

  test('a nested component keeps the same slot behavior at depth 2', async () => {
    await addSlot(page, 'Experience').click();
    const experience = listItem(page, 'Experience', 0);
    await addSlot(experience, 'Role').click();
    await expect(listItem(experience, 'Role', 0)).toBeVisible();
    await expect(experience.getByRole('button', { name: list.remove('Role', 0) })).toBeVisible();
    await fieldByLabel(listItem(experience, 'Role', 0), 'Position').fill(ROLE_NAME);
  });

  test('save, then the API order matches the screen and new items carry no uid', async () => {
    await save();
    await expect(page).toHaveURL(EDIT_URL);
    documentId = EDIT_URL.exec(page.url())?.[1] ?? '';
    const stored = await readStored();
    const skills = stored.components.skill ?? [];
    expect(skills.map((item) => item.values.skill)).toEqual([NAMES[1], NAMES[2], NAMES[0]]);
    uidsBeforeEdit = Object.fromEntries(
      skills.map((item) => [item.values.skill ?? '', item.componentUid]),
    );
    expect(Object.values(uidsBeforeEdit).every(Boolean)).toBe(true);
    expect(stored.components.experience?.[0]?.components.role).toHaveLength(1);
  });

  test('remove, move and add, save: order kept, uids of existing items kept, none for removed', async () => {
    // Screen now: Beta, Gamma, Alpha. Remove Gamma, move Alpha up, add Delta.
    await page.getByRole('button', { name: list.remove('Skill', 1) }).click();
    await page.getByRole('button', { name: list.moveUp('Skill', 1) }).click();
    await addSlot(page, 'Skill').click();
    const added = `Delta ${RUN_ID}`;
    await skillName(page, 2).fill(added);
    expect(await names(page, 3)).toEqual([NAMES[0], NAMES[1], added]);
    await save();

    const skills = (await readStored()).components.skill ?? [];
    expect(skills.map((item) => item.values.skill)).toEqual([NAMES[0], NAMES[1], added]);
    expect(skills[0]?.componentUid).toBe(uidsBeforeEdit[NAMES[0]]);
    expect(skills[1]?.componentUid).toBe(uidsBeforeEdit[NAMES[1]]);
    expect(skills.map((item) => item.componentUid)).not.toContain(uidsBeforeEdit[NAMES[2]]);

    await page.reload();
    await expect(skillName(page, 2)).toHaveValue(added);
    expect(await names(page, 3)).toEqual([NAMES[0], NAMES[1], added]);
  });
});
