import type { Page } from '@playwright/test';

import { expect, ROLES, test } from './fixtures/mockApi.ts';
import { PERMISSION_CATALOG, requirePermission } from './fixtures/mockSettings.ts';

/** The fake settings backend (Phase 4 foundation): bearer check, unmodelled routes, roles. */

/** Calls the API from the page, with the app's current bearer token when `token` is given. */
async function call(page: Page, method: string, path: string, token?: string) {
  return page.evaluate(
    async ({ method, path, token }) => {
      const res = await fetch(`/api/v1${path}`, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return { status: res.status, body: (await res.json()) as { message?: string } };
    },
    { method, path, token },
  );
}

test('settings routes answer 401 without a bearer token', async ({ page, mockApi }) => {
  mockApi.addUser({ email: 'jane@example.com', role: ROLES.superAdmin });
  await page.goto('/login');

  for (const path of ['/users', '/roles', '/permissions', '/access-tokens', '/media']) {
    expect((await call(page, 'GET', path)).status).toBe(401);
  }
});

test('an unmodelled settings route answers a Nest-style 404', async ({ page, mockApi }) => {
  mockApi.addUser({ email: 'jane@example.com', role: ROLES.superAdmin });
  mockApi.signInAs('jane@example.com');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const token = mockApi.latestAccessToken('jane@example.com');

  const res = await call(page, 'POST', '/roles/role-x/unknown', token);

  expect(res.status).toBe(404);
  expect(res.body.message).toBe('Not mocked: POST /api/v1/roles/role-x/unknown');
});

test('the store knows every user role and the full permission catalog', ({ mockApi }) => {
  mockApi.addUser({ email: 'jane@example.com', role: ROLES.admin });
  mockApi.addUser({ email: 'sam@example.com', role: ROLES.editor });

  expect(mockApi.settings.roles.map((role) => role.slug)).toEqual(['admin', 'editor']);
  expect(mockApi.settings.permissions.map((p) => p.slug)).toEqual([...PERMISSION_CATALOG]);
  expect(mockApi.settings.users().map((user) => user.email)).toEqual([
    'jane@example.com',
    'sam@example.com',
  ]);
});

test('ROLES.admin reads everything and ROLES.superAdmin has every catalog slug', () => {
  expect(ROLES.admin.level).toBe(50);
  expect(ROLES.admin.permissions.every((slug) => slug.endsWith(':read'))).toBe(true);
  expect(ROLES.superAdmin.permissions).toEqual([...PERMISSION_CATALOG]);
});

test('requirePermission mirrors the backend: manager implies read', ({ mockApi }) => {
  const manager = mockApi.addUser({
    email: 'max@example.com',
    role: { ...ROLES.editor, permissions: ['role:manager'] },
  });
  const nobody = mockApi.addUser({ email: 'nora@example.com', role: null });

  expect(requirePermission(manager, 'role:read')).toBe(true);
  expect(requirePermission(manager, 'role:manager')).toBe(true);
  expect(requirePermission(manager, 'user:read')).toBe(false);
  expect(requirePermission(nobody, 'role:read')).toBe(false);
});
