import type { Page } from '@playwright/test';

import { buildContentSecurityPolicy } from '../src/core/security/csp.ts';
import type { MediaAsset } from '../src/features/settings/types.ts';
import { FIELD_SHOWCASE, seedContent, STAMP } from './fixtures/contentFixtures.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

/**
 * The built app under the production policy (SEC-4, AC-11, AC-12). Runs only in the `csp`
 * project, which serves `vite build` output with `vite preview` and its `preview.headers`.
 */

const MEDIA_HOST = 'https://media.example.test';
const POLICY = buildContentSecurityPolicy({ apiOrigin: '', imgOrigins: MEDIA_HOST });
const ADA = 'ada@example.com';
/** A valid 1 × 1 PNG, answered for every thumbnail on the media host. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

interface Violation {
  directive: string;
  blockedURI: string;
  sourceFile: string;
}

/**
 * Records every `securitypolicyviolation` from the first script on, in `window.__cspViolations`.
 * Strings, not functions: the e2e tsconfig has no DOM lib.
 */
async function recordViolations(page: Page) {
  await page.addInitScript(`
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push({
        directive: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sourceFile: event.sourceFile,
      });
    });
  `);
}

const violations = (page: Page) => page.evaluate<Violation[]>('window.__cspViolations');

/** Answers the fake media host with a real PNG, so thumbnails can load under `img-src`. */
async function serveMediaHost(page: Page) {
  const requested: string[] = [];
  await page.route(`${MEDIA_HOST}/**`, (route) => {
    requested.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
  });
  return requested;
}

const asset = (id: string, fileName: string, createdAt: string): MediaAsset => ({
  documentId: id,
  fileName,
  mimeType: 'image/png',
  size: 1024,
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

function signInAda(mockApi: MockApi) {
  mockApi.addUser({ email: ADA, name: 'Ada Admin', role: ROLES.superAdmin });
  mockApi.signInAs(ADA);
}

test.beforeEach(async ({ page }) => {
  await recordViolations(page);
});

test('the served page sends the policy and Referrer-Policy, and has the referrer meta', async ({
  page,
  mockApi,
}) => {
  mockApi.addUser({ email: ADA, name: 'Ada Admin' });

  const response = await page.goto('/login');

  expect(response?.headers()['content-security-policy']).toBe(POLICY);
  expect(response?.headers()['referrer-policy']).toBe('same-origin');
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'same-origin');
});

test('/login renders with no CSP violation', async ({ page, mockApi }) => {
  mockApi.addUser({ email: ADA, name: 'Ada Admin' });

  await page.goto('/login');

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('/admin renders the shell with no CSP violation', async ({ page, mockApi }) => {
  signInAda(mockApi);

  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: 'Welcome, Ada Admin' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('/admin/settings/media loads thumbnails from the media host with no CSP violation', async ({
  page,
  mockApi,
}) => {
  signInAda(mockApi);
  mockApi.settings.addMedia(asset('media-cat', 'cat.png', '2026-01-01T00:00:00.000Z'));
  mockApi.settings.addMedia(asset('media-dog', 'dog.png', '2026-01-02T00:00:00.000Z'));
  const requested = await serveMediaHost(page);

  await page.goto('/admin/settings/media');

  const grid = page.getByRole('list', { name: 'Media files' });
  for (const name of ['cat.png', 'dog.png']) {
    const thumbnail = grid.getByRole('img', { name, exact: true });
    await expect(thumbnail).toBeVisible();
    await expect
      .poll(() => thumbnail.evaluate((img) => (img as { naturalWidth: number }).naturalWidth))
      .toBe(1);
  }
  expect(requested).toEqual(
    expect.arrayContaining([`${MEDIA_HOST}/thumbs/cat.png`, `${MEDIA_HOST}/thumbs/dog.png`]),
  );
  expect(await violations(page)).toEqual([]);
});

test('control: an image from an unlisted host is blocked and reported', async ({
  page,
  mockApi,
}) => {
  mockApi.addUser({ email: ADA, name: 'Ada Admin' });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  await page.evaluate(`
    const img = document.createElement('img');
    img.src = 'https://blocked.example.test/x.png';
    document.body.append(img);
  `);

  await expect
    .poll(() => violations(page))
    .toContainEqual(
      expect.objectContaining({
        directive: 'img-src',
        blockedURI: 'https://blocked.example.test/x.png',
      }),
    );
});

// Content pages (AC-35). Until the collection detail page lands (task 5.7.5), the editor check runs
// on a single type built from the showcase fields, which has richtext and media.

const SHOWCASE_SINGLE = {
  ...FIELD_SHOWCASE,
  documentId: 'ct-showcase-single',
  slug: 'showcase-single',
  name: 'Showcase single',
  kind: 'single' as const,
};

test('the content list page renders with no CSP violation', async ({
  page,
  mockApi,
  mockContent,
}) => {
  signInAda(mockApi);
  seedContent(mockContent);

  await page.goto('/admin/content-types/blog');

  await expect(page.getByRole('heading', { level: 1, name: 'Blog post' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('an entry with richtext and media renders with the editor mounted and no CSP violation', async ({
  page,
  mockApi,
  mockContent,
}) => {
  signInAda(mockApi);
  seedContent(mockContent);
  mockContent.addContentType(SHOWCASE_SINGLE);
  const cat = asset('media-cat', 'cat.png', '2026-01-01T00:00:00.000Z');
  mockApi.settings.addMedia(cat);
  mockContent.setSingle('showcase-single', {
    documentId: 'showcase-single',
    status: 'draft',
    createdAt: STAMP,
    updatedAt: STAMP,
    updatedBy: null,
    title: 'Hello',
    body: '<h2>Heading</h2><p>Some <strong>bold</strong> and <a href="https://example.com">a link</a>.</p><ul><li>One</li></ul><pre><code>x = 1</code></pre>',
    coverImage: cat,
  });
  await serveMediaHost(page);

  await page.goto('/admin/content-types/showcase-single');

  const editor = page.getByRole('textbox', { name: 'Body', exact: true });
  await expect(editor).toContainText('Heading');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  // Typing and formatting change the editor's DOM under the policy too.
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page
    .getByRole('toolbar', { name: 'Body formatting' })
    .getByRole('button', { name: 'Italic' })
    .click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(' more');
  const thumbnail = page
    .getByRole('group', { name: 'Cover image', exact: true })
    .getByRole('img', { name: 'cat.png' });
  await expect
    .poll(() => thumbnail.evaluate((img) => (img as { naturalWidth: number }).naturalWidth))
    .toBe(1);
  expect(await violations(page)).toEqual([]);
});

test('the open media picker renders with no CSP violation', async ({
  page,
  mockApi,
  mockContent,
}) => {
  signInAda(mockApi);
  seedContent(mockContent);
  mockContent.addContentType(SHOWCASE_SINGLE);
  mockApi.settings.addMedia(asset('media-cat', 'cat.png', '2026-01-01T00:00:00.000Z'));
  mockApi.settings.addMedia(asset('media-dog', 'dog.png', '2026-01-02T00:00:00.000Z'));
  await serveMediaHost(page);

  await page.goto('/admin/content-types/showcase-single');
  await page.getByRole('button', { name: 'Choose Cover image' }).click();

  const dialog = page.getByRole('dialog', { name: 'Choose cover image' });
  await expect(dialog.getByRole('radio')).toHaveCount(2);
  for (const name of ['cat.png', 'dog.png']) {
    const image = dialog.locator('label', { hasText: name }).locator('img');
    await expect
      .poll(() => image.evaluate((img) => (img as { naturalWidth: number }).naturalWidth))
      .toBe(1);
  }
  await dialog.getByRole('radio', { name: 'dog.png' }).focus();
  await page.keyboard.press('ArrowRight');
  expect(await violations(page)).toEqual([]);
});
