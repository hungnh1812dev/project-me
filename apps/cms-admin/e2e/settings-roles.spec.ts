import type { Page } from '@playwright/test';

import type { Role } from '../src/features/auth/types.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';
import { catalogPermission } from './fixtures/mockSettings.ts';

/** `/admin/settings/roles` against the fake backend (AC-1, AC-3 to AC-5, AC-7, AC-18 to AC-23). */

const ADA = 'ada@example.com';
const STAMP = '2026-01-01T00:00:00.000Z';

const customRole = (slug: string, name: string, level: number, permissions: string[]): Role => ({
  documentId: `role-${slug}`,
  name,
  slug,
  level,
  permissions,
  isDefault: false,
  createdAt: STAMP,
  updatedAt: STAMP,
  updatedBy: null,
});

const WRITER = customRole('writer', 'Writer', 10, ['document:read', 'document:update']);
const REVIEWER = customRole('reviewer', 'Reviewer', 5, ['document:read']);

/**
 * Ada, signed in with `role` (super admin by default); Bob holds Writer; Reviewer is unused; the
 * catalog gains scoped `article` and `page` document permissions.
 */
function seed(mockApi: MockApi, role: Role = ROLES.superAdmin) {
  mockApi.addUser({ email: ADA, name: 'Ada Admin', role });
  mockApi.addUser({ email: 'bob@example.com', name: 'Bob Writer', role: WRITER });
  mockApi.addUser({ email: 'eve@example.com', name: 'Eve Admin', role: ROLES.admin });
  mockApi.settings.addRole(REVIEWER);
  for (const slug of ['document:read:article', 'document:update:article', 'document:read:page']) {
    mockApi.settings.addPermission(catalogPermission(slug));
  }
  mockApi.signInAs(ADA);
}

async function openRoles(page: Page) {
  await page.goto('/admin/settings/roles');
  await expect(page.getByRole('heading', { level: 1, name: 'Roles' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Roles' })).toBeVisible();
}

const row = (page: Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('button', { name: `Edit ${name}` }) });

test('a super admin sees roles by level, expands one and searches', async ({ page, mockApi }) => {
  seed(mockApi);
  await openRoles(page);

  const names = page.getByRole('table', { name: 'Roles' }).locator('tbody tr td:first-child');
  await expect(names).toHaveText(['Super AdminDefault', 'AdminDefault', 'Writer', 'Reviewer']);
  await expect(row(page, 'Writer')).toContainText('2 permissions');

  const toggle = page.getByRole('button', { name: 'Writer: 2 permissions' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const details = page.getByRole('region', { name: 'Writer permissions' });
  await expect(details.getByRole('list', { name: 'document' }).getByRole('listitem')).toHaveText([
    'document:read',
    'document:update',
  ]);

  const before = mockApi.requests.length;
  await page.getByRole('searchbox', { name: 'Search roles' }).fill('REVIEW');
  await expect(names).toHaveText(['Reviewer']);
  expect(mockApi.requests.slice(before)).toEqual([]);
});

test('a super admin creates a role with scoped document permissions', async ({ page, mockApi }) => {
  seed(mockApi);
  await openRoles(page);

  await page.getByRole('button', { name: 'New role' }).click();
  const dialog = page.getByRole('dialog', { name: 'New role' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Article writer');
  await expect(dialog.getByRole('textbox', { name: 'Slug' })).toHaveValue('article-writer');
  await dialog.getByRole('spinbutton', { name: 'Level' }).fill('15');

  const tree = dialog.getByRole('group', { name: 'Permissions' });
  await expect(tree.getByRole('group', { name: 'All content types' })).toBeVisible();
  await tree.getByRole('checkbox', { name: 'article', exact: true }).check();
  await expect(tree.getByRole('checkbox', { name: 'document', exact: true })).toHaveJSProperty(
    'indeterminate',
    true,
  );
  await expect(tree.getByRole('group', { name: 'document' })).toContainText('2 of 9');
  const request = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/api/v1/roles'),
  );
  await dialog.getByRole('button', { name: 'Create role' }).click();

  expect((await request).postDataJSON()).toEqual({
    name: 'Article writer',
    slug: 'article-writer',
    permissions: ['document:read:article', 'document:update:article'],
    level: 15,
  });
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Role "Article writer" created.')).toBeAttached();
  await expect(row(page, 'Article writer')).toContainText('2 permissions');
});

test('a duplicate slug shows on the Slug field', async ({ page, mockApi }) => {
  seed(mockApi);
  await openRoles(page);

  await page.getByRole('button', { name: 'New role' }).click();
  const dialog = page.getByRole('dialog', { name: 'New role' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Writer');
  await dialog.getByRole('spinbutton', { name: 'Level' }).fill('1');
  await dialog.getByRole('button', { name: 'Create role' }).click();

  const slug = dialog.getByRole('textbox', { name: 'Slug' });
  await expect(slug).toHaveAttribute('aria-invalid', 'true');
  await expect(slug).toHaveAccessibleDescription(/A role with this slug already exists\./);
});

test('a default role keeps its name and level, but its permissions can change', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  await openRoles(page);

  await page.getByRole('button', { name: 'Edit Admin' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit role' });
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeDisabled();
  await expect(dialog.getByRole('spinbutton', { name: 'Level' })).toBeDisabled();
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription(
    'The name and level of a default role cannot be changed.',
  );
  await expect(dialog.getByRole('textbox', { name: 'Slug' })).toHaveAttribute('readonly', '');
  const save = dialog.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeDisabled();

  await dialog.getByRole('searchbox', { name: 'Filter permissions' }).fill('media:manager');
  await dialog.getByRole('checkbox', { name: 'media:manager' }).check();
  const request = page.waitForRequest((r) => r.method() === 'PUT');
  await save.click();

  const sent = await request;
  expect(new URL(sent.url()).pathname).toBe('/api/v1/roles/role-admin');
  expect(Object.keys(sent.postDataJSON())).toEqual(['permissions']);
  expect(sent.postDataJSON().permissions).toContain('media:manager');
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Role "Admin" updated.')).toBeAttached();
});

test('editing your own role updates the menu without a reload', async ({ page, mockApi }) => {
  seed(mockApi);
  await openRoles(page);
  const menu = page.getByRole('navigation', { name: 'Main' });
  await expect(menu.getByRole('link', { name: 'Media library' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Super Admin' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit role' });
  await dialog.getByRole('checkbox', { name: 'media', exact: true }).uncheck();
  const me = page.waitForRequest((r) => r.url().endsWith('/api/v1/auth/me'));
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  await me;
  await expect(dialog).toBeHidden();
  await expect(menu.getByRole('link', { name: 'Media library' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Roles' })).toBeVisible();
});

test('delete: refused for a default role, 409 for a role in use, done otherwise', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  // Load the users first, so the 409 can count them from the cache.
  await page.goto('/admin/settings/users');
  await expect(page.getByRole('table', { name: 'Users' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Roles' }).click();
  await expect(page.getByRole('table', { name: 'Roles' })).toBeVisible();

  const locked = page.getByRole('button', { name: 'Delete Admin' });
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  await expect(locked).toHaveAccessibleDescription('A default role cannot be deleted.');

  await page.getByRole('button', { name: 'Delete Writer' }).click();
  const inUse = page.getByRole('alertdialog', { name: 'Delete role "Writer"?' });
  await expect(inUse.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await inUse.getByRole('button', { name: 'Delete role' }).click();
  await expect(inUse.getByRole('alert')).toHaveText(
    'This role is still assigned to users. Assign them another role first. Assigned to 1 user.',
  );
  await expect(inUse.getByRole('button')).toHaveText(['Close']);
  await inUse.getByRole('button', { name: 'Close' }).click();
  await expect(inUse).toBeHidden();

  await page.getByRole('button', { name: 'Delete Reviewer' }).click();
  const unused = page.getByRole('alertdialog', { name: 'Delete role "Reviewer"?' });
  await unused.getByRole('button', { name: 'Delete role' }).click();
  await expect(unused).toBeHidden();
  await expect(page.getByText('Role "Reviewer" deleted.')).toBeAttached();
  await expect(row(page, 'Reviewer')).toHaveCount(0);
  expect(mockApi.requests).toContainEqual({
    method: 'DELETE',
    path: '/api/v1/roles/role-reviewer',
    status: 204,
  });
});

test('the read-only admin sees every write control disabled, with the reason', async ({
  page,
  mockApi,
}) => {
  seed(mockApi, ROLES.admin);
  await openRoles(page);
  const reason = 'Requires the "role:manager" permission.';

  for (const name of ['New role', 'Edit Writer', 'Delete Writer']) {
    const button = page.getByRole('button', { name });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAccessibleDescription(reason);
  }
  const edit = page.getByRole('button', { name: 'Edit Writer' });
  await edit.focus();
  await edit.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('without permission:read the tree is read-only', async ({ page, mockApi }) => {
  seed(mockApi, ROLES.userManager);
  await openRoles(page);

  await page.getByRole('button', { name: 'Edit Writer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit role' });

  await expect(
    dialog.getByText('Requires the "permission:read" permission to change permissions.'),
  ).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Permissions' }).getByRole('listitem')).toHaveText([
    'document:read',
    'document:update',
  ]);
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
});

test('without role:read the route goes to /403', async ({ page, mockApi }) => {
  seed(mockApi, ROLES.editor);

  await page.goto('/admin/settings/roles');

  await expect(page).toHaveURL('/403');
  await expect(page.getByText('Requires the "role:read" permission.')).toBeVisible();
});

test('at 375px the page and the role form do not scroll sideways', async ({ page, mockApi }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  seed(mockApi);
  await openRoles(page);

  const overflow = () =>
    page.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    );
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'New role' }).click();
  const dialog = page.getByRole('dialog', { name: 'New role' });
  await expect(dialog.getByRole('checkbox', { name: 'Select all' })).toBeVisible();
  expect(
    await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(0);
});
