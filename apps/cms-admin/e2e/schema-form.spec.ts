import type { Page } from '@playwright/test';

import type { Document } from '../src/features/content/types.ts';
import { FIELD_SHOWCASE, seedContent, STAMP } from './fixtures/contentFixtures.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

// The schema form is checked through a single type built from the showcase fields, since the
// collection detail and create pages are still stubs.
const SHOWCASE_SINGLE = {
  ...FIELD_SHOWCASE,
  documentId: 'ct-showcase-single',
  slug: 'showcase-single',
  name: 'Showcase single',
  kind: 'single' as const,
};
const URL = '/admin/content-types/showcase-single';
const S = '/api/v1/documents/single-type/showcase-single';

function signedIn(mockApi: MockApi) {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role: ROLES.superAdmin });
  mockApi.signInAs('jane@example.com');
}

function showcase(overrides: Partial<Document> = {}): Document {
  return {
    documentId: 'showcase-single',
    status: 'draft',
    createdAt: STAMP,
    updatedAt: STAMP,
    updatedBy: null,
    title: 'Hello',
    slug: 'hello',
    views: 5,
    featured: true,
    meta: { a: 1 },
    location: { lat: 1.5, lng: 2 },
    ...overrides,
  };
}

/** The `Field` wrapper of the control labelled `label`. */
const fieldBox = async (page: Page, label: string) => {
  const box = await page
    .getByLabel(label, { exact: true })
    .locator('xpath=ancestor::*[@data-slot="field"][1]')
    .boundingBox();
  expect(box).not.toBeNull();
  return box!;
};

const writes = (mockApi: MockApi) =>
  mockApi.requests.filter((r) => r.path === S && r.method !== 'GET');

test.beforeEach(async ({ mockApi, mockContent }) => {
  seedContent(mockContent);
  mockContent.addContentType(SHOWCASE_SINGLE);
  mockContent.setSingle('showcase-single', showcase());
  signedIn(mockApi);
});

test('fields follow their width at 1280px and are full width at 375px (AC-7)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URL);

  const form = (await page.getByRole('form', { name: 'Fields' }).boundingBox())!;
  const title = await fieldBox(page, 'Title');
  const slug = await fieldBox(page, 'Slug');
  const views = await fieldBox(page, 'Views');
  const featured = await fieldBox(page, 'Featured');
  const meta = await fieldBox(page, 'Meta');
  // 50% fields share a row, 1/3 fields share a row, a field without width spans the form.
  expect(slug.y).toBe(title.y);
  expect(title.width).toBeLessThan(form.width / 2);
  expect(title.width).toBeGreaterThan(form.width / 2 - 24);
  expect(featured.y).toBe(views.y);
  expect(views.width).toBeLessThan(form.width / 3);
  expect(views.width).toBeGreaterThan(form.width / 3 - 24);
  expect(meta.width).toBeCloseTo(form.width, 0);

  await page.setViewportSize({ width: 375, height: 800 });
  const narrowForm = (await page.getByRole('form', { name: 'Fields' }).boundingBox())!;
  const narrowTitle = await fieldBox(page, 'Title');
  const narrowSlug = await fieldBox(page, 'Slug');
  expect(narrowTitle.width).toBeCloseTo(narrowForm.width, 0);
  expect(narrowSlug.y).toBeGreaterThan(narrowTitle.y);
  expect((await fieldBox(page, 'Views')).width).toBeCloseTo(narrowForm.width, 0);
});

test('every primitive field renders its control with a visible label (AC-7)', async ({ page }) => {
  await page.goto(URL);

  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Hello');
  await expect(page.getByLabel('Views')).toHaveValue('5');
  await expect(page.getByRole('switch', { name: 'Featured' })).toBeChecked();
  await expect(page.getByLabel('Meta', { exact: true })).toHaveValue('{\n  "a": 1\n}');
  for (const label of ['Title', 'Views', 'Featured', 'Meta'])
    await expect(page.locator('label', { hasText: new RegExp(`^${label}$`) })).toBeVisible();
});

test('an invalid number shows "Enter a number.", takes focus and sends nothing (AC-8)', async ({
  page,
  mockApi,
}) => {
  await page.goto(URL);
  const views = page.getByLabel('Views');

  await views.fill('12abc');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('alert')).toHaveText('Enter a number.');
  await expect(views).toHaveAttribute('aria-invalid', 'true');
  await expect(views).toBeFocused();
  expect(writes(mockApi)).toEqual([]);

  await views.fill('12');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(views).not.toHaveAttribute('aria-invalid');
});

test('invalid JSON stays visible, shows its parse error and sends nothing (AC-8)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  await page.goto(URL);
  const meta = page.getByLabel('Meta', { exact: true });

  await meta.fill('{"a":');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('alert')).toContainText('Invalid JSON');
  await expect(meta).toHaveValue('{"a":');
  await expect(meta).toBeFocused();
  expect(writes(mockApi)).toEqual([]);

  await meta.fill('{"a": [1, 2]}');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  expect(mockContent.single('showcase-single')).toMatchObject({ meta: { a: [1, 2] } });
});

test('an unsupported field type shows a read-only preview and is sent back unchanged (AC-7)', async ({
  page,
  mockContent,
}) => {
  await page.goto(URL);

  const location = page.getByLabel('Location');
  await expect(location).toHaveAttribute('readonly', '');
  await expect(location).toHaveAccessibleDescription('Unsupported field type "geo"');
  await expect(location).toHaveValue('{\n  "lat": 1.5,\n  "lng": 2\n}');

  await page.getByLabel('Title', { exact: true }).fill('Changed');
  await page.getByRole('switch', { name: 'Featured' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  const save = mockContent.saves.at(-1)!.body as { data: Record<string, unknown> };
  expect(save.data).toMatchObject({
    title: 'Changed',
    slug: 'hello',
    views: 5,
    featured: false,
    meta: { a: 1 },
    location: { lat: 1.5, lng: 2 },
  });
  expect(Object.keys(save.data)).toEqual(FIELD_SHOWCASE.fields.map((f) => f.name));
});

test('repeatables, nested ones included, work with only the keyboard and save in the order shown (AC-10)', async ({
  page,
  mockContent,
}) => {
  mockContent.setSingle(
    'showcase-single',
    showcase({
      gallery: [
        { caption: 'One', image: null, tags: [{ label: 'a' }] },
        { caption: 'Two', image: null, tags: [] },
      ],
    }),
  );
  await page.goto(URL);
  const gallery = page.getByRole('group', { name: 'Gallery', exact: true });
  const entry = (n: number) =>
    gallery.getByRole('group', { name: `Gallery item ${n}`, exact: true });
  const announced = (text: string) =>
    expect(page.getByRole('status').filter({ hasText: text })).toBeAttached();
  const press = async (name: string, scope = gallery) => {
    await scope.getByRole('button', { name, exact: true }).focus();
    await page.keyboard.press('Enter');
  };
  const captions = () => gallery.getByLabel('Caption', { exact: true });

  // Add: focus goes to the new entry's first control.
  await press('Add gallery item');
  await expect(entry(3).getByLabel('Caption', { exact: true })).toBeFocused();
  await announced('Gallery item 3 added.');
  await page.keyboard.type('Three');

  // Move the new entry to the top with two presses; focus stays on the moved entry.
  await press('Move Gallery item 3 up');
  await announced('Gallery item 3 moved to position 2.');
  await page.keyboard.press('Enter');
  await announced('Gallery item 2 moved to position 1.');
  await expect(captions().nth(0)).toHaveValue('Three');
  await expect(captions().nth(1)).toHaveValue('One');
  await expect(captions().nth(2)).toHaveValue('Two');
  await expect(gallery.getByRole('button', { name: 'Move Gallery item 1 down' })).toBeFocused();

  // The nested repeatable inside "One" (now item 2).
  const tags = entry(2).getByRole('group', { name: 'Tags', exact: true });
  await press('Add tags item', tags);
  await expect(tags.getByLabel('Label', { exact: true }).nth(1)).toBeFocused();
  await page.keyboard.type('b');
  await press('Move Tags item 2 up', tags);
  await announced('Tags item 2 moved to position 1.');
  await expect(tags.getByLabel('Label', { exact: true }).nth(0)).toHaveValue('b');
  await expect(tags.getByRole('button', { name: 'Move Tags item 1 down' })).toBeFocused();

  // Remove the last entry: focus goes to the previous entry.
  await press('Remove Gallery item 3');
  await announced('Gallery item 3 removed.');
  await expect(captions()).toHaveCount(2);
  await expect(gallery.getByRole('button', { name: 'Remove Gallery item 2' })).toBeFocused();

  await page.getByRole('button', { name: 'Save' }).focus();
  await page.keyboard.press('Enter');
  await announced('Saved.');
  const save = mockContent.saves.at(-1)!.body as { data: Record<string, unknown> };
  expect(save.data.gallery).toEqual([
    { caption: 'Three', image: null, tags: [] },
    { caption: 'One', image: null, tags: [{ label: 'b' }, { label: 'a' }] },
  ]);
});

test('a top-level component is a labelled group and a nested one collapses with its hint (AC-9)', async ({
  page,
  mockContent,
}) => {
  mockContent.setSingle(
    'showcase-single',
    showcase({ seo: { metaTitle: 'Meta', social: { handle: '@jane' } } }),
  );
  await page.goto(URL);

  const seo = page.getByRole('group', { name: 'Seo', exact: true });
  await expect(seo.getByLabel('Meta title')).toHaveValue('Meta');
  const summary = seo.locator('summary');
  await expect(summary).toHaveText(/Social\s*@jane/);
  await expect(seo.getByLabel('Handle')).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(seo.getByLabel('Handle')).toBeHidden();
});
