import type { Locator, Page } from '@playwright/test';

import type { Role } from '../src/features/auth/types.ts';
import { blogPost, seedContent } from './fixtures/contentFixtures.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

// The permission gating matrix row by row (SPEC "Permission gating matrix"; AC-32, AC-33). Each
// denied control is aria-disabled with the policy's reason, and activating it sends no request.
// Document grants are checked held globally and scoped to the type; a grant scoped to another type
// does not count. A server 403 shows "no access" where the action started, and the session goes on.

const LIST = '/admin/content-types/blog';
const NO_ACCESS = "You don't have access to do this.";
const ACTIONS = ['create', 'update', 'delete', 'publish', 'unpublish'] as const;
type Action = (typeof ACTIONS)[number];

function role(slug: string, permissions: string[]): Role {
  return { ...ROLES.superAdmin, documentId: `role-${slug}`, slug, name: slug, permissions };
}

/** Every content grant but `missing`: held globally, or scoped to `blog` with `missing` on `changelog`. */
function without(missing: Action, scope: 'global' | 'scoped'): Role {
  const kept = ACTIONS.filter((action) => action !== missing);
  const base = ['content_type:read', 'media:read', 'media:manager'];
  return scope === 'global'
    ? role(`no_${missing}`, [
        ...base,
        'document:read',
        ...kept.map((action) => `document:${action}`),
      ])
    : role(`scoped_no_${missing}`, [
        ...base,
        'document:read:blog',
        ...kept.map((action) => `document:${action}:blog`),
        `document:${missing}:changelog`,
      ]);
}

function signedInAs(mockApi: MockApi, as: Role) {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role: as });
  mockApi.signInAs('jane@example.com');
}

const main = (page: Page) => page.getByRole('main');
const bar = (page: Page) => page.getByRole('region', { name: 'Bulk actions' });

/** Requests that would change content: anything but a GET under `/documents` or `/content-types`. */
const writes = (mockApi: MockApi) =>
  mockApi.requests.filter(
    (r) => r.method !== 'GET' && /\/api\/v1\/(documents|content-types)/.test(r.path),
  );

/** The control is disabled with `reason`, and clicking it or pressing Enter opens and sends nothing. */
async function expectGated(page: Page, mockApi: MockApi, control: Locator, reason: string) {
  const before = writes(mockApi).length;
  await expect(control).toHaveAttribute('aria-disabled', 'true');
  await expect(control).toHaveAccessibleDescription(reason);
  // Playwright treats aria-disabled as disabled, so force the click; Enter must do nothing either.
  await control.click({ force: true });
  await control.press('Enter');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(writes(mockApi).slice(before)).toEqual([]);
}

async function rowItem(page: Page, label: string, name: string) {
  await main(page)
    .getByRole('button', { name: `Actions for ${label}` })
    .click();
  return page.getByRole('menu').getByRole('menuitem', { name: new RegExp(`^${name}`) });
}

async function closeMenu(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}

for (const scope of ['global', 'scoped'] as const) {
  const reason = (action: Action) => `Requires the "document:${action}:blog" permission.`;

  test(`create (${scope}): Create entry and Duplicate on a row and the detail page are gated (AC-32)`, async ({
    page,
    mockApi,
    mockContent,
  }) => {
    seedContent(mockContent);
    signedInAs(mockApi, without('create', scope));
    await page.goto(LIST);

    await expectGated(
      page,
      mockApi,
      main(page).getByRole('button', { name: 'Create entry' }),
      reason('create'),
    );
    await expect(page).toHaveURL(LIST);
    await expectGated(page, mockApi, await rowItem(page, 'Post 1', 'Duplicate'), reason('create'));
    await closeMenu(page);

    await page.goto(`${LIST}/blog-1`);
    await expectGated(
      page,
      mockApi,
      main(page).getByRole('button', { name: 'Duplicate' }),
      reason('create'),
    );
  });

  test(`update (${scope}): Save on the detail page and the single type is gated (AC-32)`, async ({
    page,
    mockApi,
    mockContent,
  }) => {
    seedContent(mockContent);
    const as = without('update', scope);
    // The single type is `homepage`: scope its grants there too.
    if (scope === 'scoped') as.permissions.push('document:read:homepage');
    signedInAs(mockApi, as);

    await page.goto(`${LIST}/blog-1`);
    await expectGated(
      page,
      mockApi,
      main(page).getByRole('button', { name: 'Save' }),
      reason('update'),
    );

    await page.goto('/admin/content-types/homepage');
    await expectGated(
      page,
      mockApi,
      main(page).getByRole('button', { name: 'Save' }),
      'Requires the "document:update:homepage" permission.',
    );
  });

  test(`delete (${scope}): Delete on a row and the detail page, and Delete selected, are gated (AC-32)`, async ({
    page,
    mockApi,
    mockContent,
  }) => {
    seedContent(mockContent);
    signedInAs(mockApi, without('delete', scope));
    await page.goto(LIST);

    await expectGated(page, mockApi, await rowItem(page, 'Post 1', 'Delete'), reason('delete'));
    await closeMenu(page);
    await page.getByRole('checkbox', { name: 'Select Post 1' }).check();
    await expectGated(
      page,
      mockApi,
      bar(page).getByRole('button', { name: 'Delete selected' }),
      reason('delete'),
    );

    await page.goto(`${LIST}/blog-1`);
    await expectGated(
      page,
      mockApi,
      main(page).getByRole('button', { name: 'Delete', exact: true }),
      reason('delete'),
    );
  });

  for (const [action, name, label, documentId] of [
    ['publish', 'Publish', 'Post 1', 'blog-1'],
    ['unpublish', 'Unpublish', 'Post 2', 'blog-2'],
  ] as const) {
    test(`${action} (${scope}): ${name} on a row and the detail page, and ${name} selected, are gated (AC-32)`, async ({
      page,
      mockApi,
      mockContent,
    }) => {
      seedContent(mockContent);
      signedInAs(mockApi, without(action, scope));
      await page.goto(LIST);

      await expectGated(page, mockApi, await rowItem(page, label, name), reason(action));
      await closeMenu(page);
      await page.getByRole('checkbox', { name: `Select ${label}` }).check();
      await expectGated(
        page,
        mockApi,
        bar(page).getByRole('button', { name: `${name} selected`, exact: true }),
        reason(action),
      );

      await page.goto(`${LIST}/${documentId}`);
      await expectGated(
        page,
        mockApi,
        main(page).getByRole('button', { name, exact: true }),
        reason(action),
      );
    });
  }
}

test('Columns is gated without content_type:manager (AC-32)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi, ROLES.superAdmin);
  await page.goto(LIST);

  await expectGated(
    page,
    mockApi,
    main(page).getByRole('button', { name: 'Columns' }),
    'Requires the "content_type:manager" permission.',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Choose in a media field is gated without media:read (AC-32)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi, role('no_media', ['content_type:read', 'document:read', 'document:create']));
  await page.goto('/admin/content-types/showcase/new');

  const choose = main(page).getByRole('button', { name: 'Choose Cover image' });
  await expect(choose).toHaveAttribute('aria-disabled', 'true');
  await expect(choose).toHaveAccessibleDescription('Requires the "media:read" permission.');
  await choose.click({ force: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(mockApi.requests.filter((r) => r.path.includes('/media'))).toEqual([]);
});

test('Upload in the media picker is gated without media:manager (AC-32)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(
    mockApi,
    role('media_reader', ['content_type:read', 'document:read', 'document:create', 'media:read']),
  );
  await page.goto('/admin/content-types/showcase/new');

  await main(page).getByRole('button', { name: 'Choose Cover image' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose cover image' });
  const upload = dialog.getByRole('button', { name: 'Upload' });
  await expect(upload).toHaveAttribute('aria-disabled', 'true');
  await expect(upload).toHaveAccessibleDescription(/Requires the "media:manager" permission\./);
  expect(mockApi.requests.filter((r) => r.method === 'POST' && r.path.includes('/media'))).toEqual(
    [],
  );
});

test('a grant scoped to one type acts on that type and not on another (AC-32)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  mockContent.addDocument('showcase', { ...blogPost(9), documentId: 'show-1', title: 'Show 1' });
  signedInAs(
    mockApi,
    role('blog_publisher', ['content_type:read', 'document:read', 'document:publish:blog']),
  );

  await page.goto(LIST);
  await (await rowItem(page, 'Post 1', 'Publish')).click();
  await expect(main(page).getByText('"Post 1" published.')).toBeAttached();
  expect(writes(mockApi).map((r) => `${r.method} ${r.path}`)).toEqual([
    'POST /api/v1/documents/collection-type/blog/blog-1/publish',
  ]);

  await page.goto('/admin/content-types/showcase');
  await expectGated(
    page,
    mockApi,
    await rowItem(page, 'Show 1', 'Publish'),
    'Requires the "document:publish:showcase" permission.',
  );
});

test.describe('a server 403 shows "no access" where the action started (AC-33)', () => {
  test('on Save, Publish and Delete on the detail page', async ({ page, mockApi, mockContent }) => {
    seedContent(mockContent);
    signedInAs(mockApi, ROLES.superAdmin);
    await page.goto(`${LIST}/blog-1`);
    const save = main(page).getByRole('button', { name: 'Save' });
    await expect(save).toBeVisible();

    mockApi.failNext('PUT', '/documents/collection-type/blog/blog-1', 403);
    await page.getByLabel('Title', { exact: true }).fill('Post 1 edited');
    await save.click();
    await expect(main(page).getByRole('alert')).toContainText(NO_ACCESS);

    // The session continues: the next save goes through.
    await save.click();
    await expect(
      main(page).getByRole('heading', { level: 1, name: 'Post 1 edited' }),
    ).toBeVisible();

    mockApi.failNext('POST', '/documents/collection-type/blog/blog-1/publish', 403);
    await main(page).getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(main(page).getByRole('alert')).toContainText(NO_ACCESS);

    mockApi.failNext('DELETE', '/documents/collection-type/blog/blog-1', 403);
    await main(page).getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete "Post 1 edited"?' });
    await dialog.getByRole('button', { name: 'Delete entry' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(NO_ACCESS);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(`${LIST}/blog-1`);
  });

  test('on a bulk delete and a bulk publish', async ({ page, mockApi, mockContent }) => {
    seedContent(mockContent);
    signedInAs(mockApi, ROLES.superAdmin);
    await page.goto(LIST);

    await page.getByRole('checkbox', { name: 'Select Post 1' }).check();
    await page.getByRole('checkbox', { name: 'Select Post 3' }).check();

    mockApi.failNext('DELETE', '/documents/collection-type/blog/bulk', 403);
    await bar(page).getByRole('button', { name: 'Delete selected' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete 2 entries?' });
    await dialog.getByRole('button', { name: 'Delete entries' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(NO_ACCESS);
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    mockApi.failNext('POST', '/documents/collection-type/blog/blog-3/publish', 403);
    await bar(page).getByRole('button', { name: 'Publish selected', exact: true }).click();
    const summary = main(page).getByRole('alert');
    await expect(summary).toContainText('1 of 2 entries published.');
    await expect(summary.getByRole('listitem')).toHaveText([`Post 3: ${NO_ACCESS}`]);

    // The session continues.
    await expect(page).toHaveURL(LIST);
    await expect(bar(page).getByText('2 selected')).toBeVisible();
  });
});

test('a user without content_type:read is sent to /403 and nothing is requested (AC-41)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi, ROLES.editor);

  await page.goto('/admin/content-types');

  await expect(page).toHaveURL('/403');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  expect(mockApi.requests.filter((r) => r.path.includes('/content-types'))).toEqual([]);
});
