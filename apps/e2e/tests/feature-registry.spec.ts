import { expect, type Page, test } from '@playwright/test';

import { ADMIN_COPY } from '../src/app-contracts';
import { e2eEnv } from '../src/env';

const nav = ADMIN_COPY.access.nav;

/** R3-09: routes and nav come from the feature registry. */
const PROTECTED_PATHS = [
  '/accounts',
  '/roles',
  '/roles/some-role',
  '/api-tokens',
  '/media',
  '/reviewer',
  '/settings/security',
  '/content/x',
  '/content/x/new',
  '/content/x/some-doc',
];
const PUBLIC_PATHS = ['/login', '/set-password', '/reset-password'];
const EXPECTED_OWNER_NAV = [
  nav.accounts,
  nav.roles,
  nav.apiTokens,
  nav.media,
  nav.reviewer,
];

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: ADMIN_COPY.login.emailLabel })
    .fill(email);
  await page.getByLabel(ADMIN_COPY.login.passwordLabel).fill(password);
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
}

test.describe('anonymous', () => {
  for (const path of PROTECTED_PATHS) {
    test(`${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test('an unknown path ends on /login', async ({ page }) => {
    await page.goto('/no/such/page');
    await expect(page).toHaveURL(/\/login$/);
  });

  for (const path of PUBLIC_PATHS) {
    test(`${path} opens without a session`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator('main, form').first()).toBeVisible();
    });
  }
});

test('owner: nav order, deep links and unknown path', async ({ page }) => {
  await signIn(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  const links = page
    .getByRole('navigation', { name: nav.label })
    .getByRole('link');
  await expect(links).toHaveText(EXPECTED_OWNER_NAV);

  for (const path of [
    '/accounts',
    '/roles',
    '/api-tokens',
    '/media',
    '/reviewer',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }

  await page.goto('/no/such/page');
  await expect(page).toHaveURL(`${e2eEnv.adminUrl}/`);
});

test('reader without permissions sees no feature nav', async ({ page }) => {
  await signIn(page, e2eEnv.readerEmail, e2eEnv.readerPassword);
  await expect(
    page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: nav.label })).toHaveCount(
    0,
  );
});
