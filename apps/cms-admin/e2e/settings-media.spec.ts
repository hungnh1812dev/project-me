import type { Page } from '@playwright/test';

import type { Role } from '../src/features/auth/types.ts';
import type { MediaAsset } from '../src/features/settings/types.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

/** `/admin/settings/media` against the fake backend (AC-1, AC-3 to AC-5, AC-7, AC-35 to AC-38). */

const ADA = 'ada@example.com';
/** The fake media host; `page.route` answers it, so allowed (`https:`) thumbnails really load. */
const MEDIA_HOST = 'https://media.example.test';
/** A valid 1 × 1 PNG, answered for every request to the media host. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const asset = (id: string, fileName: string, createdAt: string): MediaAsset => ({
  documentId: id,
  fileName,
  mimeType: 'image/png',
  size: 1258291,
  width: 1920,
  height: 1080,
  url: `${MEDIA_HOST}/${fileName}`,
  thumbnailUrl: `${MEDIA_HOST}/thumbs/${fileName}`,
  publicId: `cms/${id}`,
  hash: id.padStart(64, '0'),
  uploadedBy: null,
  createdAt,
  updatedAt: createdAt,
});

test.beforeEach(async ({ page }) => {
  await page.route(`${MEDIA_HOST}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  );
});

const CAT = asset('media-cat', 'cat.png', '2026-01-01T00:00:00.000Z');
const DOG = asset('media-dog', 'dog-on-the-beach-at-sunset.png', '2026-01-02T00:00:00.000Z');

/** Ada, signed in with `role` (super admin by default), and two assets, newest first. */
function seed(mockApi: MockApi, role: Role = ROLES.superAdmin) {
  mockApi.addUser({ email: ADA, name: 'Ada Admin', role });
  mockApi.settings.addMedia({ ...CAT });
  mockApi.settings.addMedia({ ...DOG });
  mockApi.signInAs(ADA);
}

async function openMedia(page: Page) {
  await page.goto('/admin/settings/media');
  await expect(page.getByRole('heading', { level: 1, name: 'Media library' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Media files' })).toBeVisible();
}

const grid = (page: Page) => page.getByRole('list', { name: 'Media files' });
const card = (page: Page, name: string) =>
  grid(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('img', { name, exact: true }) });

/** A real image of `width` × `height` from the page's canvas, as an upload payload. */
async function image(page: Page, name: string, mimeType: string, width = 4, height = 3) {
  const dataUrl = await page.evaluate<string>(
    `(() => {
      const canvas = document.createElement('canvas');
      canvas.width = ${width};
      canvas.height = ${height};
      const context = canvas.getContext('2d');
      context.fillStyle = '#3366cc';
      context.fillRect(0, 0, ${width}, ${height});
      return canvas.toDataURL('${mimeType}');
    })()`,
  );
  return { name, mimeType, buffer: Buffer.from(dataUrl.split(',')[1] ?? '', 'base64') };
}

/** Picks files through the visible Upload button, as a keyboard or mouse user would. */
async function pick(page: Page, files: Awaited<ReturnType<typeof image>>[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload' }).click();
  await (await chooser).setFiles(files);
}

const uploads = (mockApi: MockApi) =>
  mockApi.requests.filter((request) => request.path.endsWith('/media/upload'));

test('a super admin sees the grid newest first, with details, and searches', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  await openMedia(page);

  for (const img of await grid(page).getByRole('img').all()) {
    await expect(img).toHaveAttribute('loading', 'lazy');
  }
  await expect(grid(page).getByRole('img').first()).toHaveAccessibleName(DOG.fileName);
  await expect(card(page, DOG.fileName)).toContainText('1920 × 1080');
  await expect(card(page, DOG.fileName)).toContainText('1.2 MB');
  await expect(card(page, DOG.fileName)).toContainText('Jan 2, 2026');
  await expect(card(page, DOG.fileName).getByText(DOG.fileName)).toHaveAttribute(
    'title',
    DOG.fileName,
  );

  const before = mockApi.requests.length;
  await page.getByRole('searchbox', { name: 'Search files' }).fill('CAT');
  await expect(grid(page).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: '1 file' })).toBeAttached();
  expect(mockApi.requests.length).toBe(before);
});

test('uploads a PNG and a JPEG one at a time and rejects a GIF before sending it', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  await openMedia(page);
  const png = await image(page, 'banner.png', 'image/png', 4, 3);
  const jpeg = await image(page, 'photo.jpg', 'image/jpeg');
  const gif = { name: 'anim.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') };

  await pick(page, [png, gif, jpeg]);

  const progress = page.getByRole('list', { name: 'Upload progress' });
  await expect(progress.getByRole('listitem')).toHaveText([
    /banner\.pngUploaded/,
    /anim\.gifFailed: anim\.gif: only PNG and JPEG images are supported\./,
    /photo\.jpgUploaded/,
  ]);
  await expect(page.getByText('2 of 3 files uploaded.', { exact: true }).first()).toBeVisible();
  await expect(card(page, 'banner.png')).toContainText('4 × 3');
  await expect(card(page, 'photo.jpg')).toBeVisible();
  await expect(grid(page).getByRole('listitem')).toHaveCount(4);
  expect(uploads(mockApi).map((request) => request.status)).toEqual([201, 201]);
});

test('a 413 or 422 fails only that file and the rest still upload', async ({ page, mockApi }) => {
  seed(mockApi);
  await openMedia(page);

  await pick(page, [
    await image(page, 'first.png', 'image/png'),
    await image(page, 'too-large.png', 'image/png'),
    await image(page, 'unsupported.jpg', 'image/jpeg'),
    await image(page, 'last.png', 'image/png'),
  ]);

  const progress = page.getByRole('list', { name: 'Upload progress' });
  await expect(progress.getByRole('listitem')).toHaveText([
    /first\.pngUploaded/,
    /too-large\.pngFailed: File is too large\./,
    /unsupported\.jpgFailed: Unsupported file type\./,
    /last\.pngUploaded/,
  ]);
  await expect(page.getByText('2 of 4 files uploaded.', { exact: true }).first()).toBeVisible();
  expect(uploads(mockApi).map((request) => request.status)).toEqual([201, 413, 422, 201]);
  await expect(card(page, 'last.png')).toBeVisible();
  await expect(card(page, 'too-large.png')).toHaveCount(0);
});

test('deleting confirms with the thumbnail and the broken-image note', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  await openMedia(page);
  const trigger = page.getByRole('button', { name: 'Delete cat.png' });

  await trigger.click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete "cat.png"?' });
  await expect(dialog.getByRole('img', { name: 'cat.png' })).toBeVisible();
  await expect(dialog).toContainText('Documents that use this image will show a broken image.');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Delete file' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(card(page, 'cat.png')).toHaveCount(0);
  await expect(page.getByText('File "cat.png" deleted.')).toBeAttached();
  expect(mockApi.settings.media.map((item) => item.documentId)).toEqual(['media-dog']);
});

test('the read-only admin sees Upload and Delete disabled, with the reason', async ({
  page,
  mockApi,
}) => {
  seed(mockApi, ROLES.admin);
  await openMedia(page);
  const reason = 'Requires the "media:manager" permission.';

  for (const name of ['Upload', 'Delete cat.png']) {
    const button = page.getByRole('button', { name });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAccessibleDescription(reason);
  }
  const remove = page.getByRole('button', { name: 'Delete cat.png' });
  await remove.focus();
  await remove.press('Enter');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('without media:read the route goes to /403', async ({ page, mockApi }) => {
  seed(mockApi, ROLES.editor);

  await page.goto('/admin/settings/media');

  await expect(page).toHaveURL('/403');
  await expect(page.getByText('Requires the "media:read" permission.')).toBeVisible();
});

test('at 375px the grid has 2 columns, no sideways scroll and no layout shift', async ({
  page,
  mockApi,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  seed(mockApi);
  await page.addInitScript(`
    window.__layoutShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__layoutShift += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  `);
  await openMedia(page);

  const [first, second] = await Promise.all([
    card(page, DOG.fileName).boundingBox(),
    card(page, CAT.fileName).boundingBox(),
  ]);
  expect(first?.y).toBe(second?.y);
  expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? 0);
  expect(
    await page.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    ),
  ).toBeLessThanOrEqual(0);
  await page.waitForFunction(`[...document.querySelectorAll('img')].every((img) => img.complete)`);
  expect(await page.evaluate<number>('window.__layoutShift')).toBeLessThan(0.01);
});

test('a thumbnail outside the allowlist is never requested and shows a placeholder (AC-19)', async ({
  page,
  mockApi,
}) => {
  const evilRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'evil.example.test') evilRequests.push(request.url());
  });
  seed(mockApi);
  mockApi.settings.addMedia({
    ...asset('media-evil', 'evil.png', '2026-01-03T00:00:00.000Z'),
    thumbnailUrl: 'http://evil.example.test/x.png',
  });
  await openMedia(page);

  const placeholder = card(page, 'evil.png').getByRole('img', { name: 'evil.png' });
  await expect(placeholder).toBeVisible();
  await expect(placeholder).not.toHaveAttribute('src');
  await expect(page.locator('img[src*="evil.example.test"]')).toHaveCount(0);

  const allowed = card(page, DOG.fileName).getByRole('img', { name: DOG.fileName });
  await expect(allowed).toHaveAttribute('src', DOG.thumbnailUrl);
  await expect(allowed).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect
    .poll(() => allowed.evaluate((img) => (img as { naturalWidth: number }).naturalWidth))
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Delete evil.png' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete "evil.png"?' });
  await expect(dialog.getByRole('img', { name: 'evil.png' })).toBeVisible();
  await expect(dialog.locator('img')).toHaveCount(0);
  expect(evilRequests).toEqual([]);
});

/** Adds `count` newer assets "file-01.png"…, so the newest ("file-<count>") comes first. */
function seedMany(mockApi: MockApi, count: number) {
  for (let i = 1; i <= count; i += 1) {
    const n = String(i).padStart(2, '0');
    mockApi.settings.addMedia(asset(`media-${n}`, `file-${n}.png`, `2026-02-${n}T00:00:00.000Z`));
  }
}

const MEDIA_URL = '/admin/settings/media';

test('the grid pages 10 cards, newest first, with the page in the URL: next, Back, size, deep link, clamp and search reset (Phase 6 AC-23 to AC-25)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  seedMany(mockApi, 10);
  await openMedia(page);
  const pagination = page.getByRole('navigation', { name: 'Pagination' });

  await expect(pagination.getByText('Showing 1–10 of 12')).toBeVisible();
  await expect(grid(page).getByRole('listitem')).toHaveCount(10);
  await expect(grid(page).getByRole('listitem').first()).toContainText('file-10.png');

  await pagination.getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(`${MEDIA_URL}?page=2`);
  await expect(grid(page).getByRole('listitem')).toHaveCount(2);
  await expect(card(page, DOG.fileName)).toBeVisible();
  await expect(card(page, CAT.fileName)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(MEDIA_URL);
  await expect(card(page, 'file-10.png')).toBeVisible();

  const sizeSelect = pagination.getByRole('combobox', { name: 'Rows per page' });
  await sizeSelect.click();
  await page.getByRole('option', { name: '20', exact: true }).click();
  await expect(page).toHaveURL(`${MEDIA_URL}?size=20`);
  await expect(grid(page).getByRole('listitem')).toHaveCount(12);

  await page.goto(`${MEDIA_URL}?page=3`);
  await expect(page).toHaveURL(`${MEDIA_URL}?page=2`);
  await expect(pagination.getByText('Showing 11–12 of 12')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search files' }).fill('file-0');
  await expect(page).toHaveURL(MEDIA_URL);
  await expect(pagination.getByText('Showing 1–9 of 9')).toBeVisible();
});

test('deleting the only card on the last page moves to the new last page (Phase 6 AC-26)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  seedMany(mockApi, 9);
  await page.goto(`${MEDIA_URL}?page=2`);
  const pagination = page.getByRole('navigation', { name: 'Pagination' });
  await expect(pagination.getByText('Showing 11–11 of 11')).toBeVisible();

  await page.getByRole('button', { name: 'Delete cat.png' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete file' }).click();

  await expect(page).toHaveURL(MEDIA_URL);
  await expect(pagination.getByText('Showing 1–10 of 10')).toBeVisible();
  await expect(page.getByText('File "cat.png" deleted.')).toBeAttached();
});
