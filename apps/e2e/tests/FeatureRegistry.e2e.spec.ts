import { expect, test } from '@playwright/test';

import { ADMIN_COPY } from '../src/Apps.contract';
import { CONTENT_TYPE_NAMES, CV_PAGE_SLUG } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { expectSignedIn, submitLogin } from '../src/Session.fixture';

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
// Side menu order: content types, then Utilities, then System settings.
// Content types show their display name, in the order the API lists them.
const EXPECTED_OWNER_NAV = [
  CONTENT_TYPE_NAMES['common-text'],
  CONTENT_TYPE_NAMES['cv-contact'],
  CONTENT_TYPE_NAMES['cv-page-text'],
  CONTENT_TYPE_NAMES.header,
  CONTENT_TYPE_NAMES['sign-in-text'],
  CONTENT_TYPE_NAMES['site-text'],
  CONTENT_TYPE_NAMES['status-page-text'],
  CONTENT_TYPE_NAMES[CV_PAGE_SLUG],
  CONTENT_TYPE_NAMES.profile,
  CONTENT_TYPE_NAMES.resume,
  nav.media,
  nav.accounts,
  nav.roles,
  nav.apiTokens,
  nav.reviewer,
  ADMIN_COPY.access.nav.backups,
];

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
  await submitLogin(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  const links = page.getByRole('navigation', { name: nav.label }).getByRole('link');
  await expect(links).toHaveText(EXPECTED_OWNER_NAV);

  for (const path of ['/accounts', '/roles', '/api-tokens', '/media', '/reviewer']) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }

  await page.goto('/no/such/page');
  await expect(page).toHaveURL(`${e2eEnv.adminUrl}/`);
});

test('reader without permissions sees no feature nav', async ({ page }) => {
  await submitLogin(page, e2eEnv.readerEmail, e2eEnv.readerPassword);
  await expectSignedIn(page);
  await expect(page.getByRole('navigation', { name: nav.label }).getByRole('link')).toHaveCount(0);
});
