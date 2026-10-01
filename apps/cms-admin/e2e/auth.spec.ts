import type { Page } from '@playwright/test';

import { DEFAULT_PASSWORD, expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

const JANE = { email: 'jane@example.com', name: 'Jane Doe' };

async function signIn(page: Page, email: string, password = DEFAULT_PASSWORD) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

function calls(mockApi: MockApi, from = 0) {
  return mockApi.requests.slice(from).map((r) => `${r.method} ${r.path} ${r.status}`);
}

test('signs in, lands on /admin, and opens the profile', async ({ page, mockApi }) => {
  mockApi.addUser({ ...JANE, role: ROLES.editor });

  await page.goto('/login');
  await signIn(page, JANE.email);

  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();

  await page.getByRole('link', { name: 'Your profile' }).click();
  await expect(page).toHaveURL('/admin/profile');
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await expect(page.getByText(JANE.email)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Permissions' })).toContainText('document:update');
});

test('shows a message for invalid credentials', async ({ page, mockApi }) => {
  mockApi.addUser(JANE);

  await page.goto('/login');
  await signIn(page, JANE.email, 'wrong-password');

  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
  await expect(page).toHaveURL('/login');
});

test('shows a message for an unverified email', async ({ page, mockApi }) => {
  mockApi.addUser({ ...JANE, verified: false });

  await page.goto('/login');
  await signIn(page, JANE.email);

  await expect(page.getByRole('alert')).toHaveText("Your email address isn't verified yet.");
});

test('a deep link while signed out returns there after login', async ({ page, mockApi }) => {
  mockApi.addUser(JANE);

  await page.goto('/admin/profile');
  await expect(page).toHaveURL('/login');

  await signIn(page, JANE.email);

  await expect(page).toHaveURL('/admin/profile');
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
});

test('a reload keeps the session through the refresh cookie', async ({ page, mockApi }) => {
  mockApi.addUser(JANE);
  await page.goto('/login');
  await signIn(page, JANE.email);
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();
  const before = mockApi.requests.length;

  await page.reload();

  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();
  expect(calls(mockApi, before)).toEqual([
    'POST /api/v1/auth/refresh 200',
    'GET /api/v1/auth/me 200',
  ]);
});

test('logs out to /login, and the session is gone', async ({ page, mockApi }) => {
  mockApi.addUser(JANE);
  mockApi.signInAs(JANE.email);
  await page.goto('/admin/profile');
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();

  await expect(page).toHaveURL('/login');
  expect(calls(mockApi)).toContain('POST /api/v1/auth/logout 200');

  await page.goto('/admin');
  await expect(page).toHaveURL('/login');
});

test('a user without the required permission is sent to /403', async ({ page, mockApi }) => {
  mockApi.addUser({ ...JANE, role: ROLES.editor });
  mockApi.signInAs(JANE.email);

  await page.goto('/admin/settings/users');

  await expect(page).toHaveURL('/403');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  await expect(page.getByText('Requires the "user:read" permission.')).toBeVisible();

  await page.getByRole('link', { name: 'Back to admin home' }).click();
  await expect(page).toHaveURL('/admin');
});

test('a user with the permission opens the gated page', async ({ page, mockApi }) => {
  mockApi.addUser({ ...JANE, role: ROLES.superAdmin });
  mockApi.signInAs(JANE.email);

  await page.goto('/admin/settings/users');

  await expect(page).toHaveURL('/admin/settings/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
});

test('an access token that expires mid-session is refreshed transparently', async ({
  page,
  mockApi,
}) => {
  mockApi.addUser(JANE);
  await page.goto('/login');
  await signIn(page, JANE.email);
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();
  const before = mockApi.requests.length;

  mockApi.expireAccessTokens();
  await page.getByRole('link', { name: 'Your profile' }).click();

  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await expect(page.getByText(JANE.email)).toBeVisible();
  await expect(page).toHaveURL('/admin/profile');
  // The profile shows the session user first, so the refetch may still be in flight here.
  await expect
    .poll(() => calls(mockApi, before))
    .toEqual([
      'GET /api/v1/auth/me 401',
      'POST /api/v1/auth/refresh 200',
      'GET /api/v1/auth/me 200',
    ]);
});

test('a session that cannot be refreshed goes to /login, then back after re-login', async ({
  page,
  mockApi,
}) => {
  mockApi.addUser(JANE);
  await page.goto('/login');
  await signIn(page, JANE.email);
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();

  mockApi.expireAccessTokens();
  mockApi.revokeSession();
  await page.getByRole('link', { name: 'Your profile' }).click();

  await expect(page).toHaveURL('/login');
  await signIn(page, JANE.email);

  await expect(page).toHaveURL('/admin/profile');
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
});

test('a bootstrap that cannot reach the server offers Retry', async ({ page, mockApi }) => {
  mockApi.addUser(JANE);
  mockApi.signInAs(JANE.email);
  // The first try and its 3 backoff retries (2s, 5s, 10s) all fail.
  mockApi.failNext('POST', '/auth/refresh', 503, 4);
  await page.clock.install();

  await page.goto('/admin');
  const alert = page.getByRole('alert');
  await expect(async () => {
    await page.clock.runFor(5000);
    await expect(alert).toBeVisible({ timeout: 100 });
  }).toPass();
  await expect(alert).toContainText("Can't reach the server.");

  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();
});
