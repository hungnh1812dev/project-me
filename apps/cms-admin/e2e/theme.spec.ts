import type { Page } from '@playwright/test';

import { expect, ROLES, test } from './fixtures/mockApi.ts';

const DARK = /(^|\s)dark(\s|$)/;

/** Seeds the stored theme choice before any page script runs. */
const storeTheme = (page: Page, choice: string) =>
  page.addInitScript({ content: `window.localStorage.setItem('cms-admin:theme', '${choice}');` });

test('the page title is CMS Admin', async ({ page }) => {
  await page.goto('/login');

  await expect(page).toHaveTitle(/CMS Admin/);
});

test('a stored dark choice applies before React mounts (no flash)', async ({ page }) => {
  await storeTheme(page, 'dark');
  // Block the app bundle: only the pre-paint script can set the theme.
  await page.route('**/src/main.tsx', (route) => route.abort());

  await page.goto('/login');

  await expect(page.locator('html')).toHaveClass(DARK);
  await expect(page.locator('#root')).toBeEmpty();
});

test('System follows the OS setting before mount and live after it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.locator('html')).toHaveClass(DARK);

  await page.emulateMedia({ colorScheme: 'light' });

  await expect(page.locator('html')).not.toHaveClass(DARK);
});

test('a stored light choice wins over a dark OS setting', async ({ page }) => {
  await storeTheme(page, 'light');
  await page.emulateMedia({ colorScheme: 'dark' });

  await page.goto('/login');
  await expect(page.locator('#root')).not.toBeEmpty();

  await expect(page.locator('html')).not.toHaveClass(DARK);
});

test('with localStorage blocked the theme follows the OS and nothing throws', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.addInitScript({
    content: `Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Blocked', 'SecurityError'); },
    });`,
  });
  await page.emulateMedia({ colorScheme: 'dark' });

  await page.goto('/login');
  await expect(page.locator('#root')).not.toBeEmpty();

  await expect(page.locator('html')).toHaveClass(DARK);
  expect(pageErrors).toEqual([]);
});

test('fonts are self-hosted: no request goes to a font CDN', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) external.push(request.url());
  });

  await page.goto('/login');
  await expect(page.locator('#root')).not.toBeEmpty();
  await page.evaluate('document.fonts.ready');

  expect(external).toEqual([]);
  await expect(page.locator('body')).toHaveCSS('font-family', /Fira Sans/);
});

// Expected values come from the SPEC colour table (stone and gold palette).
for (const { choice, background, foreground, primary, primaryInk } of [
  {
    choice: 'light',
    background: 'rgb(250, 250, 249)', // #FAFAF9
    foreground: 'rgb(43, 43, 43)', // #2B2B2B
    primary: 'rgb(212, 175, 55)', // #D4AF37
    primaryInk: 'rgb(122, 92, 20)', // #7A5C14
  },
  {
    choice: 'dark',
    background: 'rgb(28, 26, 23)', // #1C1A17
    foreground: 'rgb(245, 245, 244)', // #F5F5F4
    primary: 'rgb(212, 175, 55)', // #D4AF37
    primaryInk: 'rgb(224, 192, 104)', // #E0C068
  },
]) {
  test(`the shared @repo/ui theme tokens reach the page in the ${choice} theme`, async ({
    page,
  }) => {
    await storeTheme(page, choice);

    await page.goto('/login');
    await expect(page.locator('#root')).not.toBeEmpty();

    await expect(page.locator('body')).toHaveCSS('background-color', background);
    await expect(page.locator('body')).toHaveCSS('color', foreground);
    // The auth page's submit button uses the default (primary) variant.
    await expect(page.locator('button[type="submit"]')).toHaveCSS('background-color', primary);
    await expect(page.locator('button[type="submit"]')).toHaveCSS('border-top-color', primaryInk);
  });
}

for (const { choice, primary, highlight } of [
  // SPEC colour table: primary #D4AF37 in both themes, highlight #7A5C14 / #E0C068.
  { choice: 'light', primary: 'rgb(212, 175, 55)', highlight: 'rgb(122, 92, 20)' },
  { choice: 'dark', primary: 'rgb(212, 175, 55)', highlight: 'rgb(224, 192, 104)' },
]) {
  test(`the UI kit shows the primary and highlight swatches and the highlight badge (${choice}, AC-14)`, async ({
    page,
    mockApi,
  }) => {
    mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role: ROLES.contentEditor });
    mockApi.signInAs('jane@example.com');
    await storeTheme(page, choice);

    await page.goto('/admin/dev/ui-kit');
    const colour = page.getByRole('region', { name: 'Colour' });

    await expect(colour.getByText('primary', { exact: true })).toHaveCSS(
      'background-color',
      primary,
    );
    await expect(colour.getByText('highlight', { exact: true })).toHaveCSS(
      'background-color',
      highlight,
    );
    await expect(page.getByRole('region', { name: 'Badge' }).getByText('Highlight')).toHaveCSS(
      'background-color',
      highlight,
    );
  });
}
