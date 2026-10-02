import type { Page } from '@playwright/test';

import type { Role } from '../src/features/auth/types.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';
import { catalogPermission } from './fixtures/mockSettings.ts';

/** `/admin/settings/permissions` against the fake backend (AC-1, AC-3 to AC-5, AC-7, AC-24 to AC-27). */

const ADA = 'ada@example.com';

/** Ada, signed in with `role` (super admin by default), plus an unused `article:export`. */
function seed(mockApi: MockApi, role: Role = ROLES.superAdmin) {
  mockApi.addUser({ email: ADA, name: 'Ada Admin', role });
  mockApi.settings.addPermission({
    ...catalogPermission('article:export'),
    name: 'Export articles',
    description: 'Download articles as CSV.',
  });
  mockApi.signInAs(ADA);
}

async function openPermissions(page: Page) {
  await page.goto('/admin/settings/permissions');
  await expect(page.getByRole('heading', { level: 1, name: 'Permissions' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'role permissions' })).toBeVisible();
}

const row = (page: Page, slug: string) =>
  page.getByRole('row').filter({ has: page.getByRole('cell', { name: slug, exact: true }) });

test('a super admin sees the catalog grouped by resource and searches it', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  await openPermissions(page);

  await expect(page.locator('summary')).toHaveText([
    'api_token2 permissions',
    'article1 permission',
    'content_type1 permission',
    'document6 permissions',
    'media2 permissions',
    'permission2 permissions',
    'role2 permissions',
    'user3 permissions',
  ]);
  await expect(row(page, 'article:export')).toContainText('Download articles as CSV.');
  const before = mockApi.requests.length;

  await page.getByRole('searchbox', { name: 'Search permissions' }).fill('csv');

  await expect(page.getByRole('table')).toHaveCount(1);
  await expect(row(page, 'article:export')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^1 permission$/ })).toBeAttached();
  expect(mockApi.requests.slice(before)).toEqual([]);
});

test('a super admin creates a permission; a duplicate slug shows on the field', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  await openPermissions(page);

  await page.getByRole('button', { name: 'New permission' }).click();
  const dialog = page.getByRole('dialog', { name: 'New permission' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('textbox', { name: 'Slug' })).toBeFocused();
  await expect(dialog.getByRole('note')).toContainText('Creating a permission grants nothing');

  await dialog.getByRole('textbox', { name: 'Slug' }).fill('role:read');
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Duplicate');
  await dialog.getByRole('textbox', { name: 'Description' }).fill('Already there.');
  await dialog.getByRole('button', { name: 'Create permission' }).click();

  const slug = dialog.getByRole('textbox', { name: 'Slug' });
  await expect(slug).toHaveAttribute('aria-invalid', 'true');
  await expect(slug).toHaveAccessibleDescription(/A permission with this slug already exists\./);

  await slug.fill('report:export');
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Export reports');
  await dialog.getByRole('textbox', { name: 'Description' }).fill('Download reports.');
  const request = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/api/v1/permissions'),
  );
  await dialog.getByRole('textbox', { name: 'Name' }).press('Enter');

  expect((await request).postDataJSON()).toEqual({
    slug: 'report:export',
    name: 'Export reports',
    description: 'Download reports.',
  });
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Permission "report:export" created.')).toBeAttached();
  await expect(row(page, 'report:export')).toContainText('Export reports');
  await expect(page.getByRole('button', { name: 'New permission' })).toBeFocused();
});

test('editing sends only the changed fields and keeps the slug read-only', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  await openPermissions(page);

  await page.getByRole('button', { name: 'Edit article:export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit permission' });
  await expect(dialog.getByRole('textbox', { name: 'Slug' })).toHaveAttribute('readonly', '');
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await dialog.getByRole('textbox', { name: 'Description' }).fill('Download articles as JSON.');
  const request = page.waitForRequest((r) => r.method() === 'PUT');
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  const sent = await request;
  expect(new URL(sent.url()).pathname).toBe('/api/v1/permissions/perm-article-export');
  expect(sent.postDataJSON()).toEqual({ description: 'Download articles as JSON.' });
  await expect(dialog).toBeHidden();
  await expect(row(page, 'article:export')).toContainText('Download articles as JSON.');
  await expect(page.getByText('Permission "article:export" updated.')).toBeAttached();
});

test('an unused permission is deleted after confirmation', async ({ page, mockApi }) => {
  seed(mockApi);
  await openPermissions(page);

  await page.getByRole('button', { name: 'Delete article:export' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete article:export?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Delete permission' }).click();

  await expect(dialog).toBeHidden();
  await expect(row(page, 'article:export')).toHaveCount(0);
  await expect(page.getByText('Permission "article:export" deleted.')).toBeAttached();
  expect(mockApi.requests).toContainEqual({
    method: 'DELETE',
    path: '/api/v1/permissions/perm-article-export',
    status: 204,
  });
});

test('a permission still in use shows the conflict counts and only Close', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  mockApi.settings.addAccessToken({
    documentId: 'tok-1',
    name: 'CI publish',
    permissions: ['document:publish'],
    expiresAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: null,
  });
  await openPermissions(page);

  await page.getByRole('button', { name: 'Delete document:publish' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Delete permission' }).click();

  await expect(dialog).toHaveAccessibleName('document:publish is still in use');
  await expect(dialog.getByRole('alert')).toHaveText(
    'This permission is still used by 1 role and 1 access token. Remove it from them first.',
  );
  await expect(dialog.getByRole('link', { name: 'Roles' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Access tokens' })).toBeVisible();
  await expect(dialog.getByRole('button')).toHaveText(['Close']);
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  expect(mockApi.requests).toContainEqual({
    method: 'DELETE',
    path: '/api/v1/permissions/perm-document-publish',
    status: 409,
  });

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, 'document:publish')).toBeVisible();
});

test('the read-only admin sees every write control disabled, with the reason', async ({
  page,
  mockApi,
}) => {
  seed(mockApi, ROLES.admin);
  await openPermissions(page);
  const reason = 'Requires the "permission:manager" permission.';

  for (const name of ['New permission', 'Edit article:export', 'Delete article:export']) {
    const button = page.getByRole('button', { name });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAccessibleDescription(reason);
  }
  const remove = page.getByRole('button', { name: 'Delete article:export' });
  await remove.focus();
  await remove.press('Enter');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('without permission:read the route goes to /403', async ({ page, mockApi }) => {
  seed(mockApi, ROLES.editor);

  await page.goto('/admin/settings/permissions');

  await expect(page).toHaveURL('/403');
  await expect(page.getByText('Requires the "permission:read" permission.')).toBeVisible();
});

test('at 375px the page does not scroll sideways', async ({ page, mockApi }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  seed(mockApi);
  await openPermissions(page);

  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const region = page.getByRole('region', { name: 'document permissions table' });
  await region.focus();
  await expect(region).toBeFocused();
});
