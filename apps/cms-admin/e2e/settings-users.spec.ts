import type { Page } from '@playwright/test';

import type { Role } from '../src/features/auth/types.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

/** `/admin/settings/users` against the fake backend (AC-1, AC-3 to AC-5, AC-7, AC-12 to AC-17). */

const ADA = 'ada@example.com';
const JANE = 'jane@example.com';
const JOHN = 'john@example.com';

/** Ada (signed in, `role` defaults to super admin), Jane (editor) and John (no role). */
function seed(mockApi: MockApi, role: Role = ROLES.superAdmin) {
  mockApi.addUser({ email: ADA, name: 'Ada Admin', role });
  const jane = mockApi.addUser({ email: JANE, name: 'Jane Doe', role: ROLES.editor });
  const john = mockApi.addUser({ email: JOHN, name: 'John Smith', role: null, verified: false });
  mockApi.settings.addRole(ROLES.admin);
  mockApi.signInAs(ADA);
  return { jane, john };
}

async function openUsers(page: Page) {
  await page.goto('/admin/settings/users');
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Users' })).toBeVisible();
}

const row = (page: Page, email: string) => page.getByRole('row').filter({ hasText: email });

test('a super admin sees every user with the joined role, verified text and "You"', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  await openUsers(page);

  await expect(row(page, ADA)).toContainText('You');
  await expect(row(page, ADA)).toContainText('Super Admin');
  await expect(row(page, JANE)).toContainText('Editor');
  await expect(row(page, JANE)).toContainText('Verified');
  await expect(row(page, JOHN)).toContainText('No role');
  await expect(row(page, JOHN)).toContainText('Not verified');
  await expect(page.getByRole('main')).not.toContainText(/password/i);
});

test('the search filters on the client and announces the count', async ({ page, mockApi }) => {
  seed(mockApi);
  await openUsers(page);
  const before = mockApi.requests.length;

  await page.getByRole('searchbox', { name: 'Search users' }).fill('smith');

  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(row(page, JOHN)).toBeVisible();
  await expect(page.getByText('1 user', { exact: true })).toBeAttached();
  expect(mockApi.requests.slice(before)).toEqual([]);
});

test('a super admin assigns a lower role, then deletes a user', async ({ page, mockApi }) => {
  const { jane, john } = seed(mockApi);
  await openUsers(page);

  const changeRole = page.getByRole('button', { name: `Change role for ${JANE}` });
  await changeRole.click();
  const dialog = page.getByRole('alertdialog', { name: `Change the role of ${JANE}?` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  const select = dialog.getByRole('combobox', { name: 'Role' });
  await expect(select).toContainText('Editor (level 20)');
  await select.click();
  await expect(page.getByRole('option')).toHaveText(['Admin (level 50)', 'Editor (level 20)']);
  await page.getByRole('option', { name: 'Admin (level 50)' }).click();
  await dialog.getByRole('button', { name: 'Change role' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'changed to Admin' })).toHaveText(
    `Role of ${JANE} changed to Admin.`,
  );
  await expect(row(page, JANE)).toContainText('Admin');
  expect(mockApi.requests).toContainEqual({
    method: 'PATCH',
    path: `/api/v1/users/${jane.documentId}/role`,
    status: 200,
  });

  await page.getByRole('button', { name: `Delete ${JOHN}` }).click();
  const confirm = page.getByRole('alertdialog', { name: `Delete ${JOHN}?` });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Delete user' }).click();

  await expect(confirm).toBeHidden();
  await expect(row(page, JOHN)).toHaveCount(0);
  await expect(page.getByText(`User ${JOHN} deleted.`)).toBeAttached();
  expect(mockApi.requests).toContainEqual({
    method: 'DELETE',
    path: `/api/v1/users/${john.documentId}`,
    status: 204,
  });
});

test('Escape closes a dialog and focus returns to its row button', async ({ page, mockApi }) => {
  seed(mockApi);
  await openUsers(page);
  const trigger = page.getByRole('button', { name: `Delete ${JANE}` });

  await trigger.click();
  await expect(page.getByRole('alertdialog')).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Escape');

  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('a server 403 shows inside the role dialog', async ({ page, mockApi }) => {
  const { jane } = seed(mockApi);
  mockApi.failNext('PATCH', `/users/${jane.documentId}/role`, 403);
  await openUsers(page);

  await page.getByRole('button', { name: `Change role for ${JANE}` }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Change role' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Forced 403');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(row(page, JANE)).toContainText('Editor');
});

test('the read-only admin sees every action disabled, with the reason', async ({
  page,
  mockApi,
}) => {
  seed(mockApi, ROLES.admin);
  await openUsers(page);

  const change = page.getByRole('button', { name: `Change role for ${JANE}` });
  const remove = page.getByRole('button', { name: `Delete ${JANE}` });
  await expect(change).toHaveAttribute('aria-disabled', 'true');
  await expect(change).toHaveAccessibleDescription('Requires the "user:role_manager" permission.');
  await expect(remove).toHaveAttribute('aria-disabled', 'true');
  await expect(remove).toHaveAccessibleDescription('Requires the "user:manager" permission.');

  await remove.focus();
  await expect(remove).toBeFocused();
  await remove.press('Enter');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('the own row is denied', async ({ page, mockApi }) => {
  seed(mockApi);
  await openUsers(page);

  await expect(
    page.getByRole('button', { name: `Change role for ${ADA}` }),
  ).toHaveAccessibleDescription('You cannot change your own role.');
  await expect(page.getByRole('button', { name: `Delete ${ADA}` })).toHaveAccessibleDescription(
    'You cannot delete your own account.',
  );
});

test('without role:read, roles show as "Unknown" and their actions are denied', async ({
  page,
  mockApi,
}) => {
  const noRoleRead: Role = {
    ...ROLES.superAdmin,
    documentId: 'role-user-boss',
    slug: 'user_boss',
    name: 'User Boss',
    permissions: ['user:read', 'user:manager', 'user:role_manager'],
  };
  seed(mockApi, noRoleRead);
  await openUsers(page);

  await expect(row(page, JANE)).toContainText('Unknown');
  await expect(row(page, JOHN)).toContainText('No role');
  await expect(page.getByRole('button', { name: `Delete ${JANE}` })).toHaveAccessibleDescription(
    'Requires a higher role level than the target user.',
  );
  await expect(page.getByRole('button', { name: `Change role for ${JANE}` })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(mockApi.requests.filter((r) => r.path === '/api/v1/roles')).toEqual([]);
});

test('without user:read the route goes to /403', async ({ page, mockApi }) => {
  seed(mockApi, ROLES.editor);

  await page.goto('/admin/settings/users');

  await expect(page).toHaveURL('/403');
  await expect(page.getByText('Requires the "user:read" permission.')).toBeVisible();
});

test('at 375px the page does not scroll sideways; the table scrolls in its region', async ({
  page,
  mockApi,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  seed(mockApi);
  await openUsers(page);

  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const region = page.getByRole('region', { name: 'Users table' });
  expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await region.focus();
  await expect(region).toBeFocused();
});

/** Adds `count` editors named "User 01"…, sorted after Ada, Jane and John. */
function seedMany(mockApi: MockApi, count: number) {
  for (let i = 1; i <= count; i += 1) {
    const n = String(i).padStart(2, '0');
    mockApi.addUser({ email: `user${n}@example.com`, name: `User ${n}`, username: `user${n}` });
  }
}

const USERS_URL = '/admin/settings/users';

test('the list pages 10 rows with the page in the URL: next, previous, Back, size, deep link and clamp (Phase 6 AC-21, AC-24)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  seedMany(mockApi, 10);
  await openUsers(page);
  const pagination = page.getByRole('navigation', { name: 'Pagination' });
  const rows = page.getByRole('table', { name: 'Users' }).getByRole('row');

  await expect(pagination.getByText('Showing 1–10 of 13')).toBeVisible();
  await expect(rows).toHaveCount(11); // header + 10 rows
  await expect(page).toHaveURL(USERS_URL);
  await expect(pagination.getByRole('button', { name: 'Previous page' })).toBeDisabled();

  const next = pagination.getByRole('button', { name: 'Next page' });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${USERS_URL}?page=2`);
  await expect(pagination.getByText('Showing 11–13 of 13')).toBeVisible();
  await expect(rows).toHaveCount(4);
  await expect(row(page, 'user10@example.com')).toBeVisible();
  await expect(pagination.getByRole('button', { name: 'Previous page' })).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(USERS_URL);
  await expect(pagination.getByText('Showing 1–10 of 13')).toBeVisible();
  await page.goForward();
  await expect(pagination.getByText('Page 2 of 2')).toBeVisible();

  await pagination.getByRole('button', { name: 'Previous page' }).click();
  await expect(page).toHaveURL(USERS_URL);

  const sizeSelect = pagination.getByRole('combobox', { name: 'Rows per page' });
  await sizeSelect.click();
  await page.getByRole('option', { name: '20', exact: true }).click();
  await expect(page).toHaveURL(`${USERS_URL}?size=20`);
  await expect(pagination.getByText('Showing 1–13 of 13')).toBeVisible();
  await expect(sizeSelect).toBeFocused();

  await page.goto(`${USERS_URL}?page=2`);
  await expect(pagination.getByText('Showing 11–13 of 13')).toBeVisible();

  await page.goto(`${USERS_URL}?page=9`);
  await expect(page).toHaveURL(`${USERS_URL}?page=2`);
  await expect(pagination.getByText('Page 2 of 2')).toBeVisible();

  await page.goto(`${USERS_URL}?page=abc&size=7`);
  await expect(page).toHaveURL(USERS_URL);
  await expect(pagination.getByText('Showing 1–10 of 13')).toBeVisible();
});

test('a search resets to page 1 and the count still announces every match (Phase 6 AC-25)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  seedMany(mockApi, 10);
  await page.goto(`${USERS_URL}?page=2`);
  const pagination = page.getByRole('navigation', { name: 'Pagination' });
  await expect(pagination.getByText('Page 2 of 2')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search users' }).fill('User 0');

  await expect(page).toHaveURL(USERS_URL);
  await expect(pagination.getByText('Showing 1–9 of 9')).toBeVisible();
  await expect(page.getByText('9 users', { exact: true })).toBeAttached();

  await page.getByRole('searchbox', { name: 'Search users' }).fill('nobody');
  await expect(pagination).toHaveCount(0);
});

test('deleting the only row on the last page moves to the new last page (Phase 6 AC-26)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  seedMany(mockApi, 8);
  await page.goto(`${USERS_URL}?page=2`);
  const pagination = page.getByRole('navigation', { name: 'Pagination' });
  await expect(pagination.getByText('Showing 11–11 of 11')).toBeVisible();

  await page.getByRole('button', { name: 'Delete user08@example.com' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete user' }).click();

  await expect(page).toHaveURL(USERS_URL);
  await expect(pagination.getByText('Showing 1–10 of 10')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'deleted' })).toHaveText(
    'User user08@example.com deleted.',
  );
});
