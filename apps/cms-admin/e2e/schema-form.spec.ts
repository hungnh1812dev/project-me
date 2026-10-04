import type { Page } from '@playwright/test';

import type { Document } from '../src/features/content/types.ts';
import type { MediaAsset } from '../src/features/settings/types.ts';
import { FIELD_SHOWCASE, seedContent, STAMP } from './fixtures/contentFixtures.ts';
import { editorText } from './fixtures/jsonEditor.ts';
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
  // `has` pierces the JSON editor's shadow root, where an ancestor XPath can't.
  const box = await page
    .locator('[data-slot="field"]', { has: page.getByLabel(label, { exact: true }) })
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
  await expect
    .poll(() => editorText(page.getByLabel('Meta', { exact: true })))
    .toBe('{\n  "a": 1\n}');
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
  expect(await editorText(meta)).toBe('{"a":');
  await expect(meta).toBeFocused();
  expect(writes(mockApi)).toEqual([]);

  await meta.fill('{"a": [1, 2]}');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  expect(mockContent.single('showcase-single')).toMatchObject({ meta: { a: [1, 2] } });
});

test('JSON typed with the keyboard validates after blur, formats and saves (AC-17, AC-18, AC-22)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  await page.goto(URL);
  const meta = page.getByRole('textbox', { name: 'Meta', exact: true });
  const format = page
    .locator('[data-slot="field"]', { has: meta })
    .getByRole('button', { name: 'Format JSON' });
  await meta.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');

  // closeBrackets adds the closing `}` and `]` the keys would also type, so type the inside only.
  await page.keyboard.type('{"tags":["a"');
  await expect(page.getByRole('alert')).toHaveCount(0); // no error before the first blur
  await page.keyboard.press('Tab');
  await expect(meta).not.toBeFocused();
  expect(await editorText(meta)).toBe('{"tags":["a"]}');
  await expect(page.getByRole('alert')).toHaveCount(0);

  await format.click();
  await expect.poll(() => editorText(meta)).toBe('{\n  "tags": [\n    "a"\n  ]\n}');

  await meta.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('x');
  await expect(page.getByRole('alert')).toContainText('Invalid JSON'); // every change after blur
  await expect(meta).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.press('Backspace');
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  expect(writes(mockApi)).toHaveLength(1);
  expect(mockContent.single('showcase-single')).toMatchObject({ meta: { tags: ['a'] } });
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

// Richtext (AC-11, AC-12)

const ROUND_TRIP_WARNING =
  "This entry contains formatting the editor can't keep. Saving will remove it.";
const LINK_ERROR = 'Links must start with http://, https:// or mailto:.';

const lastSave = (mockContent: { saves: { body: unknown }[] }) =>
  (mockContent.saves.at(-1)!.body as { data: Record<string, unknown> }).data;

/** Focuses the editor and selects all of its text, with the keyboard. */
async function selectAllInEditor(page: Page) {
  const editor = page.getByRole('textbox', { name: 'Body', exact: true });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  return editor;
}

test('richtext: the toolbar is one tab stop, moves with the arrows and shows pressed states (AC-12)', async ({
  page,
  mockContent,
}) => {
  mockContent.setSingle('showcase-single', showcase({ body: '<p>Hello world</p>' }));
  await page.goto(URL);
  const toolbar = page.getByRole('toolbar', { name: 'Body formatting' });
  const editor = await selectAllInEditor(page);

  // Shift+Tab from the editor lands on the toolbar's single tab stop.
  await page.keyboard.press('Shift+Tab');
  await expect(toolbar.getByRole('button', { name: 'Bold' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const italic = toolbar.getByRole('button', { name: 'Italic' });
  await expect(italic).toBeFocused();
  await expect(italic).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');

  await expect(italic).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.locator('em')).toHaveText('Hello world');
  // Tab from the editor's previous control reaches the toolbar on the last-used button.
  await page.keyboard.press('Shift+Tab');
  await expect(italic).toBeFocused();
  await page.keyboard.press('End');
  await expect(toolbar.getByRole('button', { name: 'Link' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(toolbar.getByRole('button', { name: 'Bold' })).toBeFocused();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  expect(lastSave(mockContent).body).toBe('<p><em>Hello world</em></p>');
});

test('richtext: a javascript: link is rejected with a message, an https link is saved (AC-12)', async ({
  page,
  mockContent,
}) => {
  mockContent.setSingle('showcase-single', showcase({ body: '<p>Docs</p>' }));
  await page.goto(URL);
  const toolbar = page.getByRole('toolbar', { name: 'Body formatting' });
  await selectAllInEditor(page);

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  const url = page.getByRole('textbox', { name: 'Link URL' });
  await expect(url).toBeFocused();
  await page.keyboard.type('javascript:alert(1)');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('alert')).toHaveText(LINK_ERROR);
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  expect(mockContent.saves).toEqual([]);

  await url.fill('https://example.com/docs');
  await page.keyboard.press('Enter');
  await expect(url).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Link' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  expect(lastSave(mockContent).body).toBe('<p><a href="https://example.com/docs">Docs</a></p>');
});

test('richtext: saved HTML holds only the allowed elements (AC-12)', async ({
  page,
  mockContent,
}) => {
  mockContent.setSingle('showcase-single', showcase({ body: '' }));
  await page.goto(URL);
  const toolbar = page.getByRole('toolbar', { name: 'Body formatting' });
  await page.getByRole('textbox', { name: 'Body', exact: true }).click();

  await page.keyboard.type('Start');
  await page.keyboard.press('Enter');
  await toolbar.getByRole('button', { name: 'Heading 3' }).click();
  await page.keyboard.type('Sub');
  await page.keyboard.press('Enter');
  await toolbar.getByRole('button', { name: 'Bulleted list' }).click();
  await page.keyboard.type('One');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Two');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await toolbar.getByRole('button', { name: 'Code block' }).click();
  await page.keyboard.type('x = 1');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  const html = String(lastSave(mockContent).body);
  expect(html).toBe(
    '<p>Start</p><h3>Sub</h3><ul><li><p>One</p></li><li><p>Two</p></li></ul><pre><code>x = 1</code></pre>',
  );
  const tags = [...html.matchAll(/<([a-z0-9]+)/g)].map((match) => match[1]);
  const allowed = [
    'p',
    'h2',
    'h3',
    'h4',
    'strong',
    'em',
    's',
    'code',
    'pre',
    'ul',
    'ol',
    'li',
    'blockquote',
    'a',
  ];
  expect(tags.filter((tag) => !allowed.includes(tag!))).toEqual([]);
});

test('richtext: unsupported server markup shows the D2 warning and saving removes it (AC-12)', async ({
  page,
  mockContent,
}) => {
  mockContent.setSingle(
    'showcase-single',
    showcase({ body: '<p class="lead" style="color: red">Kept <u>text</u></p><hr>' }),
  );
  await page.goto(URL);

  const editor = page.getByRole('textbox', { name: 'Body', exact: true });
  await expect(page.getByText(ROUND_TRIP_WARNING)).toBeVisible();
  await expect(editor).toHaveAccessibleDescription(ROUND_TRIP_WARNING);
  // Loading alone doesn't make the form dirty.
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await page.getByLabel('Title', { exact: true }).fill('Changed');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  expect(lastSave(mockContent).body).toBe('<p>Kept text</p>');
  await expect(page.getByText(ROUND_TRIP_WARNING)).toHaveCount(0);
});

test('the editor chunk loads only on a form with a richtext field (AC-11)', async ({
  page,
  mockContent,
}) => {
  mockContent.addContentType({
    ...SHOWCASE_SINGLE,
    documentId: 'ct-plain-single',
    slug: 'plain-single',
    name: 'Plain single',
    fields: [{ name: 'headline', type: 'text' }],
  });
  mockContent.setSingle('plain-single', {
    documentId: 'plain-single',
    status: 'draft',
    createdAt: STAMP,
    updatedAt: STAMP,
    updatedBy: null,
    headline: 'Plain',
  });
  const editorRequests: string[] = [];
  page.on('request', (request) => {
    if (/RichTextEditor|tiptap|prosemirror/i.test(request.url()))
      editorRequests.push(request.url());
  });

  await page.goto('/admin/content-types/plain-single');
  await expect(page.getByLabel('Headline')).toHaveValue('Plain');
  await page.goto('/admin/content-types/blog');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(editorRequests).toEqual([]);

  // Control: the showcase form has a richtext field, so the chunk is requested.
  await page.goto(URL);
  await expect(page.getByRole('textbox', { name: 'Body', exact: true })).toBeVisible();
  expect(editorRequests.length).toBeGreaterThan(0);
});

// Media (AC-13)

const MEDIA_HOST = 'https://media.example.test';
/** A valid 1 × 1 PNG. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const mediaAsset = (id: string, fileName: string, createdAt = STAMP): MediaAsset => ({
  documentId: id,
  fileName,
  mimeType: 'image/png',
  size: 2048,
  width: 1,
  height: 1,
  url: `${MEDIA_HOST}/${fileName}`,
  thumbnailUrl: `${MEDIA_HOST}/thumbs/${fileName}`,
  publicId: `cms/${id}`,
  hash: id.padStart(64, '0'),
  uploadedBy: null,
  createdAt,
  updatedAt: createdAt,
});
const CAT = mediaAsset('media-cat', 'cat.png', '2026-01-01T00:00:00.000Z');
const DOG = mediaAsset('media-dog', 'dog.png', '2026-01-02T00:00:00.000Z');

async function seedMedia(page: Page, mockApi: MockApi) {
  mockApi.settings.addMedia(CAT);
  mockApi.settings.addMedia(DOG);
  await page.route(`${MEDIA_HOST}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  );
}

const cover = (page: Page) => page.getByRole('group', { name: 'Cover image', exact: true });

/** Presses Tab until a radio of the open picker has focus. */
async function tabToRadios(page: Page) {
  for (let i = 0; i < 10; i += 1) {
    if (await page.evaluate('document.activeElement?.getAttribute("type") === "radio"')) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('No radio took focus');
}

test('media: picks an asset with only the keyboard and saves the full asset (AC-13)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  await seedMedia(page, mockApi);
  await page.goto(URL);

  await cover(page).getByRole('button', { name: 'Choose Cover image' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Choose cover image' });
  await expect(dialog.getByRole('radio')).toHaveCount(2);
  await tabToRadios(page);
  await expect(dialog.getByRole('radio', { name: 'dog.png' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('radio', { name: 'cat.png' })).toBeChecked();
  await page.keyboard.press('Enter');

  await expect(dialog).toHaveCount(0);
  await expect(cover(page).getByText('cat.png')).toBeVisible();
  await expect(cover(page).getByRole('img', { name: 'cat.png' })).toHaveAttribute('src', CAT.url);
  await expect(
    page.getByRole('status').filter({ hasText: 'Cover image set to cat.png.' }),
  ).toBeAttached();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  expect(lastSave(mockContent).coverImage).toEqual(CAT);
});

test('media: an uploaded PNG is selected automatically (AC-13)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  await seedMedia(page, mockApi);
  await page.goto(URL);

  await cover(page).getByRole('button', { name: 'Choose Cover image' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose cover image' });
  await expect(dialog.getByRole('radio')).toHaveCount(2);
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: PIXEL });

  await expect(dialog.getByText('1 of 1 file uploaded.')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'new.png' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Select' }).click();
  await expect(cover(page).getByText('new.png')).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  expect(lastSave(mockContent).coverImage).toMatchObject({
    fileName: 'new.png',
    mimeType: 'image/png',
    documentId: expect.stringMatching(/^media-\d+$/),
  });
});

test('media: Remove clears the value and the save sends null (AC-13)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  await seedMedia(page, mockApi);
  mockContent.setSingle('showcase-single', showcase({ coverImage: DOG }));
  await page.goto(URL);

  await expect(cover(page).getByText('dog.png')).toBeVisible();
  await cover(page).getByRole('button', { name: 'Remove Cover image' }).click();
  await expect(cover(page).getByText('No file selected.')).toBeVisible();
  await expect(cover(page).getByRole('button', { name: 'Choose Cover image' })).toBeFocused();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  expect(lastSave(mockContent).coverImage).toBeNull();
});

test('media: a documentId value resolves to the asset, or shows "File not found" (AC-13)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  await seedMedia(page, mockApi);
  mockContent.setSingle(
    'showcase-single',
    showcase({
      coverImage: 'media-cat',
      gallery: [{ caption: 'Gone', image: 'media-gone', tags: [] }],
    }),
  );
  await page.goto(URL);

  await expect(cover(page).getByText('cat.png')).toBeVisible();
  const gone = page.getByRole('group', { name: 'Image', exact: true });
  await expect(gone.getByText('File not found')).toBeVisible();
  await expect(gone.getByRole('button', { name: 'Remove Image' })).toBeVisible();

  await page.getByLabel('Title', { exact: true }).fill('Changed');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  const data = lastSave(mockContent);
  // The resolved id is saved as the full asset; the unknown one goes back as it came.
  expect(data.coverImage).toEqual(CAT);
  expect(data.gallery).toEqual([{ caption: 'Gone', image: 'media-gone', tags: [] }]);
});

test('media: the preview is a 320px contain box with icon buttons and tooltips (AC-28, AC-31)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  await seedMedia(page, mockApi);
  mockContent.setSingle('showcase-single', showcase({ coverImage: DOG }));
  await page.goto(URL);

  const img = cover(page).getByRole('img', { name: 'dog.png' });
  await expect(img).toHaveAttribute('src', DOG.url);
  await expect
    .poll(() => img.evaluate((node) => (node as { naturalWidth: number }).naturalWidth))
    .toBeGreaterThan(0);
  await expect(img).toHaveCSS('object-fit', 'contain');
  const box = await cover(page).locator('[data-slot="media-preview"]').boundingBox();
  const group = await cover(page).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(320);
  // Full width: the group's 8px padding and 1px border on each side.
  expect(box?.width).toBeCloseTo((group?.width ?? 0) - 18, 0);
  await expect(cover(page).getByText('1 × 1')).toBeVisible();

  const choose = cover(page).getByRole('button', { name: 'Choose Cover image' });
  const remove = cover(page).getByRole('button', { name: 'Remove Cover image' });
  await expect(choose).toHaveText('');
  await expect(remove).toHaveText('');
  await choose.hover();
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveText(
    'Choose Cover image',
  );
  await remove.focus();
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveText(
    'Remove Cover image',
  );
});

// XSS (AC-34)

test('richtext holding <script> and <img onerror> runs nothing and loads nothing (AC-34)', async ({
  page,
  mockContent,
}) => {
  mockContent.setSingle(
    'showcase-single',
    showcase({
      body:
        '<p>Safe text</p><script>window.__xss = "script"; alert("script")</script>' +
        '<img src="x" onerror="window.__xss = \'onerror\'; alert(\'onerror\')">' +
        '<p><a href="javascript:alert(\'link\')">Click</a></p>',
    }),
  );
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const imageRequests: string[] = [];
  page.on('request', (request) => {
    // The page's `URL` constant shadows the global, so match the path with a pattern.
    if (/^[a-z]+:\/\/[^/]+(?:\/[^?#]*)?\/x(?:[?#]|$)/.test(request.url())) {
      imageRequests.push(request.url());
    }
  });

  await page.goto(URL);
  const editor = page.getByRole('textbox', { name: 'Body', exact: true });
  await expect(editor).toContainText('Safe text');
  await expect(page.getByText(ROUND_TRIP_WARNING)).toBeVisible();
  // The dropped link keeps its text without an href; clicking it does nothing.
  await editor.getByText('Click').click();

  expect(await page.evaluate('window.__xss')).toBeUndefined();
  expect(dialogs).toEqual([]);
  expect(imageRequests).toEqual([]);
  await expect(page.locator('script', { hasText: '__xss' })).toHaveCount(0);
  await expect(editor.locator('img, script, a')).toHaveCount(0);
});
