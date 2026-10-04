import type { Page } from '@playwright/test';

import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

/** `/admin/profile` name editing against the fake backend (AC-39 to AC-41, U2). */

const JANE = 'jane@example.com';

/** Jane, an editor with no `user:*` permission: U2 on herself needs only the bearer. */
function seed(mockApi: MockApi) {
  const jane = mockApi.addUser({ email: JANE, name: 'Jane Doe', role: ROLES.editor });
  mockApi.signInAs(JANE);
  return jane;
}

async function openProfile(page: Page) {
  await page.goto('/admin/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Your profile' })).toBeVisible();
}

const putRequests = (mockApi: MockApi) => mockApi.requests.filter((r) => r.method === 'PUT');

test('renaming updates the card and the header without a reload, sending exactly { name }', async ({
  page,
  mockApi,
}) => {
  const jane = seed(mockApi);
  await openProfile(page);
  const trigger = page.getByRole('button', { name: 'Account menu' });
  await expect(trigger).toContainText('JD');
  // A reload would drop this marker.
  await page.evaluate('window.__noReload = true');

  await page.getByRole('button', { name: 'Edit name' }).click();
  const input = page.getByRole('textbox', { name: 'Name' });
  await expect(input).toHaveValue('Jane Doe');
  await expect(input).toBeFocused();
  await input.fill('  Jane Roe  ');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Name updated.' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Edit name' })).toBeFocused();
  await expect(page.getByRole('main')).toContainText('Jane Roe');
  await expect(trigger).toContainText('JR');
  await expect(trigger).toContainText('Jane Roe');
  expect(await page.evaluate<boolean>('window.__noReload === true')).toBe(true);
  expect(mockApi.settings.userUpdates).toEqual([
    { documentId: jane.documentId, body: { name: 'Jane Roe' } },
  ]);

  // The rename is stored: a fresh load still shows it.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Account menu' })).toContainText('Jane Roe');
});

test('Cancel restores the view and focus without sending anything', async ({ page, mockApi }) => {
  seed(mockApi);
  await openProfile(page);

  await page.getByRole('button', { name: 'Edit name' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Someone Else');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('textbox', { name: 'Name' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit name' })).toBeFocused();
  await expect(page.getByRole('main')).toContainText('Jane Doe');
  expect(putRequests(mockApi)).toEqual([]);
});

test('an empty name is refused on the client', async ({ page, mockApi }) => {
  seed(mockApi);
  await openProfile(page);

  await page.getByRole('button', { name: 'Edit name' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('   ');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Enter your name.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true');
  expect(putRequests(mockApi)).toEqual([]);
});

test('a server error shows as an alert and keeps the typed name', async ({ page, mockApi }) => {
  const jane = seed(mockApi);
  mockApi.failNext('PUT', `/users/${jane.documentId}`, 400);
  await openProfile(page);

  await page.getByRole('button', { name: 'Edit name' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Jane Roe');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Forced 400' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Jane Roe');
  await expect(page.getByRole('button', { name: 'Account menu' })).toContainText('Jane Doe');
});

test('the profile offers no password change (AC-41)', async ({ page, mockApi }) => {
  seed(mockApi);
  await openProfile(page);
  await page.getByRole('button', { name: 'Edit name' }).click();

  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText(/password/i);
});

test('the U2 mock refuses a password key and another user without user:manager', async ({
  page,
  mockApi,
}) => {
  const jane = seed(mockApi);
  const sam = mockApi.addUser({ email: 'sam@example.com', name: 'Sam', role: ROLES.editor });
  await openProfile(page);
  const token = mockApi.latestAccessToken(JANE);

  const put = (id: string, body: unknown) =>
    page.evaluate(
      async ({ id, body, token }) => {
        const res = await fetch(`/api/v1/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        return res.status;
      },
      { id, body, token },
    );

  expect(await put(jane.documentId, { name: 'Jane', password: 'x' })).toBe(400);
  expect(await put(sam.documentId, { name: 'Hacked' })).toBe(403);
  expect(mockApi.settings.users().find((u) => u.email === JANE)?.name).toBe('Jane Doe');
  expect(mockApi.settings.userUpdates).toHaveLength(2);
});
