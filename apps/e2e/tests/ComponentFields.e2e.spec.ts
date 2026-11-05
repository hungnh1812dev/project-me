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
  components: { roles?: unknown[] };
}
interface StoredDocument {
  components: { skills?: StoredItem[]; experiences?: StoredItem[] };
}

const addSlot = (scope: Page | ReturnType<typeof listItem>, label: string) =>
  scope.getByRole('button', { name: list.addSlot(label), exact: true });

const skillName = (page: Page, index: number) =>
  fieldByLabel(listItem(page, 'Skills', index), 'Skill');

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
    const slot = addSlot(page, 'Skills');
    await expect(slot).toBeVisible();
    await expect(listItem(page, 'Skills', 0)).toHaveCount(0);

    await slot.click();
    await expect(listItem(page, 'Skills', 0)).toBeVisible();
    await slot.focus();
    await page.keyboard.press('Enter');
    await expect(listItem(page, 'Skills', 1)).toBeVisible();
    await slot.focus();
    await page.keyboard.press('Space');
    await expect(listItem(page, 'Skills', 2)).toBeVisible();

    for (const [index, name] of NAMES.entries()) {
      await skillName(page, index).fill(name);
    }
    await fieldByLabel(page, 'Position').fill(POSITION);
  });

  test('ends are disabled and the focus follows the moved item', async () => {
    await expect(page.getByRole('button', { name: list.moveUp('Skills', 0) })).toBeDisabled();
    await expect(page.getByRole('button', { name: list.moveDown('Skills', 2) })).toBeDisabled();

    await page.getByRole('button', { name: list.moveDown('Skills', 0) }).focus();
    await page.keyboard.press('Enter');
    expect(await names(page, 3)).toEqual([NAMES[1], NAMES[0], NAMES[2]]);
    await expect(page.getByRole('button', { name: list.moveDown('Skills', 1) })).toBeFocused();

    // The item reached the bottom: focus moves to the enabled opposite control.
    await page.keyboard.press('Enter');
    expect(await names(page, 3)).toEqual([NAMES[1], NAMES[2], NAMES[0]]);
    await expect(page.getByRole('button', { name: list.moveUp('Skills', 2) })).toBeFocused();
  });

  test('tab order per item is remove, up, down, then the next item and the slot', async () => {
    await page.getByRole('button', { name: list.remove('Skills', 1) }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: list.moveUp('Skills', 1) })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: list.moveDown('Skills', 1) })).toBeFocused();
  });

  test('a nested component keeps the same slot behavior at depth 2', async () => {
    await addSlot(page, 'Experiences').click();
    const experience = listItem(page, 'Experiences', 0);
    await addSlot(experience, 'Roles').click();
    await expect(listItem(experience, 'Roles', 0)).toBeVisible();
    await expect(experience.getByRole('button', { name: list.remove('Roles', 0) })).toBeVisible();
    await fieldByLabel(listItem(experience, 'Roles', 0), 'Position').fill(ROLE_NAME);
    // Projects live under a role (three levels deep).
    await addSlot(listItem(experience, 'Roles', 0), 'Projects').click();
    await expect(listItem(listItem(experience, 'Roles', 0), 'Projects', 0)).toBeVisible();
  });

  test('two 1/2 fields share one row at desktop width', async () => {
    const position = fieldByLabel(page, 'Position').first();
    const isMain = page.getByRole('switch', { name: 'Is Main' });
    const [positionBox, isMainBox] = await Promise.all([
      position.boundingBox(),
      isMain.boundingBox(),
    ]);
    expect(positionBox).not.toBeNull();
    expect(isMainBox).not.toBeNull();
    const positionMiddle = (positionBox?.y ?? 0) + (positionBox?.height ?? 0) / 2;
    const isMainMiddle = (isMainBox?.y ?? 0) + (isMainBox?.height ?? 0) / 2;
    expect(Math.abs(positionMiddle - isMainMiddle)).toBeLessThan(positionBox?.height ?? 0);
    expect(isMainBox?.x ?? 0).toBeGreaterThan(
      (positionBox?.x ?? 0) + (positionBox?.width ?? 0) - 1,
    );
  });

  test('save, then the API order matches the screen and new items carry no uid', async () => {
    await save();
    await expect(page).toHaveURL(EDIT_URL);
    documentId = EDIT_URL.exec(page.url())?.[1] ?? '';
    const stored = await readStored();
    const skills = stored.components.skills ?? [];
    expect(skills.map((item) => item.values.skill)).toEqual([NAMES[1], NAMES[2], NAMES[0]]);
    uidsBeforeEdit = Object.fromEntries(
      skills.map((item) => [item.values.skill ?? '', item.componentUid]),
    );
    expect(Object.values(uidsBeforeEdit).every(Boolean)).toBe(true);
    expect(stored.components.experiences?.[0]?.components.roles).toHaveLength(1);
  });

  test('remove, move and add, save: order kept, uids of existing items kept, none for removed', async () => {
    // Screen now: Beta, Gamma, Alpha. Remove Gamma, move Alpha up, add Delta.
    await page.getByRole('button', { name: list.remove('Skills', 1) }).click();
    await page.getByRole('button', { name: list.moveUp('Skills', 1) }).click();
    await addSlot(page, 'Skills').click();
    const added = `Delta ${RUN_ID}`;
    await skillName(page, 2).fill(added);
    expect(await names(page, 3)).toEqual([NAMES[0], NAMES[1], added]);
    await save();

    const skills = (await readStored()).components.skills ?? [];
    expect(skills.map((item) => item.values.skill)).toEqual([NAMES[0], NAMES[1], added]);
    expect(skills[0]?.componentUid).toBe(uidsBeforeEdit[NAMES[0]]);
    expect(skills[1]?.componentUid).toBe(uidsBeforeEdit[NAMES[1]]);
    expect(skills.map((item) => item.componentUid)).not.toContain(uidsBeforeEdit[NAMES[2]]);

    await page.reload();
    await expect(skillName(page, 2)).toHaveValue(added);
    expect(await names(page, 3)).toEqual([NAMES[0], NAMES[1], added]);
  });
});
