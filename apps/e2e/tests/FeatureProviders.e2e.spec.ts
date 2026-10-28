import { expect, type Page, test } from '@playwright/test';

import { ADMIN_COPY } from '../src/Apps.contract';
import { e2eEnv } from '../src/E2e.env';

const MISSING_PROVIDER_PATTERN = /must be used (inside|within)/i;
const PAGE_PATHS = [
  '/',
  '/accounts',
  '/roles',
  '/api-tokens',
  '/media',
  '/reviewer',
  '/settings/security',
];
const PUBLIC_PATHS = ['/login', '/set-password', '/reset-password'];

function collectProviderErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

function expectNoMissingProvider(errors: string[]) {
  expect(errors.filter((text) => MISSING_PROVIDER_PATTERN.test(text))).toEqual(
    [],
  );
}

/** R3-10: API services and providers are built from the feature registry. */
test('public pages render without a missing-provider error', async ({
  page,
}) => {
  const errors = collectProviderErrors(page);
  for (const path of PUBLIC_PATHS) {
    await page.goto(path);
    await expect(page.locator('main, form').first()).toBeVisible();
  }
  expectNoMissingProvider(errors);
});

test('owner: every feature page loads, then signs out', async ({ page }) => {
  const errors = collectProviderErrors(page);
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: ADMIN_COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page
    .getByLabel(ADMIN_COPY.login.passwordLabel)
    .fill(e2eEnv.ownerPassword);
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
  const signOut = page.getByRole('button', {
    name: ADMIN_COPY.session.signOut,
  });
  await expect(signOut).toBeVisible();

  for (const path of PAGE_PATHS) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByText(MISSING_PROVIDER_PATTERN)).toHaveCount(0);
  }

  await page.reload();
  await expect(signOut).toBeVisible();
  await signOut.click();
  await expect(page).toHaveURL(/\/login$/);
  expectNoMissingProvider(errors);
});
