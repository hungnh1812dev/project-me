import type { Page } from '@playwright/test';

import type { Role } from '../src/features/auth/types.ts';
import type { AccessToken } from '../src/features/settings/types.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

/** `/admin/settings/access-tokens` against the fake backend (AC-1, AC-3 to AC-5, AC-7, AC-28 to AC-34). */

const ADA = 'ada@example.com';
const STAMP = '2026-01-01T00:00:00.000Z';

const token = (
  id: string,
  name: string,
  permissions: string[],
  expiresAt: string | null,
): AccessToken => ({
  documentId: id,
  name,
  permissions,
  expiresAt,
  createdAt: STAMP,
  updatedAt: STAMP,
  updatedBy: null,
});

const DEPLOY = token(
  'tok-deploy',
  'Deploy bot',
  ['document:read', 'document:update'],
  '2099-01-01T00:00:00.000Z',
);
const LEGACY = token('tok-legacy', 'Legacy import', [], '2020-01-01T00:00:00.000Z');
const PREVIEW = token('tok-preview', 'Preview', ['document:read'], null);

/** Ada, signed in with `role` (super admin by default), and three tokens. */
function seed(mockApi: MockApi, role: Role = ROLES.superAdmin) {
  mockApi.addUser({ email: ADA, name: 'Ada Admin', role });
  for (const item of [DEPLOY, LEGACY, PREVIEW]) mockApi.settings.addAccessToken({ ...item });
  mockApi.signInAs(ADA);
}

async function openTokens(page: Page) {
  await page.goto('/admin/settings/access-tokens');
  await expect(page.getByRole('heading', { level: 1, name: 'Access tokens' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Access tokens' })).toBeVisible();
}

const row = (page: Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('button', { name: `Delete ${name}` }) });

/** Everything the page shows or keeps in the DOM, inputs included. */
const pageText = (page: Page) =>
  page.evaluate<string>(
    `document.documentElement.outerHTML + '\\n' +
      [...document.querySelectorAll('input, textarea')].map((element) => element.value).join('\\n')`,
  );

/** Every place outside the DOM where a secret must never land (AC-33). */
const storedText = (page: Page) =>
  page.evaluate<string>(
    'JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href })',
  );

test('a super admin sees the tokens with expiry, expands one and searches', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  await openTokens(page);

  await expect(row(page, 'Deploy bot')).toContainText('2 permissions');
  await expect(row(page, 'Deploy bot')).toContainText('Jan 1, 2099');
  await expect(row(page, 'Legacy import')).toContainText('Expired');
  await expect(row(page, 'Preview')).toContainText('Never');
  await expect(row(page, 'Deploy bot')).not.toContainText('Expired');

  const toggle = page.getByRole('button', { name: 'Deploy bot: 2 permissions' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page
      .getByRole('region', { name: 'Deploy bot permissions' })
      .getByRole('list', { name: 'document' })
      .getByRole('listitem'),
  ).toHaveText(['document:read', 'document:update']);

  const before = mockApi.requests.length;
  await page.getByRole('searchbox', { name: 'Search access tokens' }).fill('PREV');
  await expect(page.getByRole('table', { name: 'Access tokens' }).locator('tbody tr')).toHaveCount(
    1,
  );
  await expect(page.getByText('1 access token', { exact: true })).toBeAttached();
  expect(mockApi.requests.slice(before)).toEqual([]);
});

test('a super admin creates a token, copies its secret once, and it is gone after Done', async ({
  page,
  context,
  mockApi,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  seed(mockApi);
  await openTokens(page);
  const newToken = page.getByRole('button', { name: 'New token' });

  await newToken.click();
  const dialog = page.getByRole('dialog', { name: 'New token' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await expect(dialog.getByRole('combobox', { name: 'Expires' })).toContainText('1 month');
  await expect(
    dialog.getByText("A token with no permissions can't call any protected endpoint."),
  ).toBeVisible();

  await dialog.getByRole('textbox', { name: 'Name' }).fill('Nightly export');
  await dialog.getByRole('checkbox', { name: 'document', exact: true }).check();
  await expect(dialog.getByRole('checkbox', { name: 'document', exact: true })).toBeChecked();
  await expect(
    dialog.getByText("A token with no permissions can't call any protected endpoint."),
  ).toBeHidden();
  await dialog.getByRole('textbox', { name: 'Name' }).press('Enter');

  const reveal = page.getByRole('alertdialog', { name: 'Copy your token now' });
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveAttribute('aria-modal', 'true');
  await expect(reveal).toContainText("You won't be able to see it again.");
  await expect(dialog).toBeHidden();
  const input = reveal.getByRole('textbox', { name: 'Token' });
  const secret = await input.inputValue();
  expect(secret).toMatch(/^cms_live_/);

  // The list request answered before the reveal carries no secret (AC-28).
  const listed = JSON.stringify(mockApi.settings.accessTokens);
  expect(listed).not.toContain(secret);

  await reveal.getByRole('button', { name: 'Copy' }).click();
  await expect(reveal.getByRole('status')).toHaveText('Copied.');
  await expect(reveal.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate<string>('navigator.clipboard.readText()')).toBe(secret);

  // Only Done closes it (AC-34).
  await page.keyboard.press('Escape');
  await expect(reveal).toBeVisible();

  await reveal.getByRole('button', { name: 'Done' }).click();
  await expect(reveal).toBeHidden();
  await expect(newToken).toBeFocused();
  await expect(page.getByText('Token "Nightly export" created.')).toBeAttached();
  await expect(row(page, 'Nightly export')).toContainText('6 permissions');
  expect(await pageText(page)).not.toContain(secret);
  expect(await storedText(page)).not.toContain(secret);
  expect(mockApi.requests).toContainEqual({
    method: 'POST',
    path: '/api/v1/access-tokens',
    status: 201,
  });
});

test('revoking shows a new secret once and keeps the record', async ({ page, mockApi }) => {
  seed(mockApi);
  await openTokens(page);

  const revokeSecret = async () => {
    await page.getByRole('button', { name: 'Revoke Deploy bot' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Revoke token "Deploy bot"?' });
    await expect(confirm).toContainText(
      'The current secret stops working immediately. A new secret will be shown once.',
    );
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await confirm.getByRole('button', { name: 'Revoke token' }).click();
    const reveal = page.getByRole('alertdialog', { name: 'Copy your token now' });
    const secret = await reveal.getByRole('textbox', { name: 'Token' }).inputValue();
    await reveal.getByRole('button', { name: 'Done' }).click();
    await expect(reveal).toBeHidden();
    return secret;
  };

  const first = await revokeSecret();
  const second = await revokeSecret();

  expect(first).toMatch(/^cms_live_/);
  expect(second).toMatch(/^cms_live_/);
  expect(second).not.toBe(first);
  await expect(page.getByRole('button', { name: 'Revoke Deploy bot' })).toBeFocused();
  await expect(
    page.getByText('Token "Deploy bot" revoked. Its new secret was shown once.'),
  ).toBeAttached();
  await expect(row(page, 'Deploy bot')).toContainText('2 permissions');
  await expect(row(page, 'Deploy bot')).toContainText('Jan 1, 2099');
  const html = await pageText(page);
  expect(html).not.toContain(first);
  expect(html).not.toContain(second);
  expect(mockApi.requests).toContainEqual({
    method: 'POST',
    path: '/api/v1/access-tokens/tok-deploy/revoke',
    status: 200,
  });
});

test('deleting a token removes its row', async ({ page, mockApi }) => {
  seed(mockApi);
  await openTokens(page);

  await page.getByRole('button', { name: 'Delete Preview' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete token "Preview"?' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Delete token' }).click();

  await expect(confirm).toBeHidden();
  await expect(row(page, 'Preview')).toHaveCount(0);
  await expect(page.getByText('Token "Preview" deleted.')).toBeAttached();
  expect(mockApi.requests).toContainEqual({
    method: 'DELETE',
    path: '/api/v1/access-tokens/tok-preview',
    status: 204,
  });
});

test('server errors stay inside the dialogs', async ({ page, mockApi }) => {
  seed(mockApi);
  mockApi.failNext('POST', '/access-tokens', 400);
  await openTokens(page);

  await page.getByRole('button', { name: 'New token' }).click();
  const dialog = page.getByRole('dialog', { name: 'New token' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Broken');
  await dialog.getByRole('button', { name: 'Create token' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Forced 400');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // The token is gone on the server: T3 answers 404.
  mockApi.settings.removeAccessToken('tok-preview');
  await page.getByRole('button', { name: 'Revoke Preview' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Revoke token "Preview"?' });
  await confirm.getByRole('button', { name: 'Revoke token' }).click();
  await expect(confirm.getByRole('alert')).toHaveText('Access token not found');
  await expect(page.getByRole('alertdialog', { name: 'Copy your token now' })).toHaveCount(0);
});

test('the read-only admin sees every write control disabled, with the reason', async ({
  page,
  mockApi,
}) => {
  seed(mockApi, ROLES.admin);
  await openTokens(page);
  const reason = 'Requires the "api_token:manager" permission.';

  for (const name of ['New token', 'Revoke Deploy bot', 'Delete Deploy bot']) {
    const button = page.getByRole('button', { name });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAccessibleDescription(reason);
  }
  const revoke = page.getByRole('button', { name: 'Revoke Deploy bot' });
  await revoke.focus();
  await revoke.press('Enter');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('without api_token:read the route goes to /403', async ({ page, mockApi }) => {
  seed(mockApi, ROLES.editor);

  await page.goto('/admin/settings/access-tokens');

  await expect(page).toHaveURL('/403');
  await expect(page.getByText('Requires the "api_token:read" permission.')).toBeVisible();
});

test('at 375px the page and the token form do not scroll sideways', async ({ page, mockApi }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  seed(mockApi);
  await openTokens(page);

  expect(
    await page.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    ),
  ).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'New token' }).click();
  const dialog = page.getByRole('dialog', { name: 'New token' });
  await expect(dialog.getByRole('checkbox', { name: 'Select all' })).toBeVisible();
  expect(
    await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(0);
});

/** Adds `count` tokens "Token 01"… after the three seeded ones. */
function seedMany(mockApi: MockApi, count: number) {
  for (let i = 1; i <= count; i += 1) {
    const n = String(i).padStart(2, '0');
    mockApi.settings.addAccessToken(token(`tok-${n}`, `Token ${n}`, ['document:read'], null));
  }
}

const TOKENS_URL = '/admin/settings/access-tokens';

test('tokens page 10 at a time with the page in the URL: next, Back, size, deep link, clamp and search reset (Phase 6 AC-21, AC-24, AC-25)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  seedMany(mockApi, 9);
  await openTokens(page);
  const pagination = page.getByRole('navigation', { name: 'Pagination' });

  await expect(pagination.getByText('Showing 1–10 of 12')).toBeVisible();
  await pagination.getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(`${TOKENS_URL}?page=2`);
  await expect(row(page, 'Token 09')).toBeVisible();
  await expect(row(page, 'Deploy bot')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(TOKENS_URL);
  await expect(row(page, 'Deploy bot')).toBeVisible();

  const sizeSelect = pagination.getByRole('combobox', { name: 'Rows per page' });
  await sizeSelect.click();
  await page.getByRole('option', { name: '20', exact: true }).click();
  await expect(page).toHaveURL(`${TOKENS_URL}?size=20`);
  await expect(pagination.getByText('Showing 1–12 of 12')).toBeVisible();

  await page.goto(`${TOKENS_URL}?page=5`);
  await expect(page).toHaveURL(`${TOKENS_URL}?page=2`);
  await expect(pagination.getByText('Showing 11–12 of 12')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search access tokens' }).fill('Token 0');
  await expect(page).toHaveURL(TOKENS_URL);
  await expect(pagination.getByText('Showing 1–9 of 9')).toBeVisible();
});

test('deleting the only token on the last page moves to the new last page (Phase 6 AC-26)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi);
  seedMany(mockApi, 8);
  await page.goto(`${TOKENS_URL}?page=2`);
  const pagination = page.getByRole('navigation', { name: 'Pagination' });
  await expect(pagination.getByText('Showing 11–11 of 11')).toBeVisible();

  await page.getByRole('button', { name: 'Delete Token 08' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete token' }).click();

  await expect(page).toHaveURL(TOKENS_URL);
  await expect(pagination.getByText('Showing 1–10 of 10')).toBeVisible();
  await expect(page.getByText('Token "Token 08" deleted.')).toBeAttached();
});
