import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/mockApi.ts';

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

for (const { choice, background, foreground, primary } of [
  {
    choice: 'light',
    background: 'rgb(255, 255, 255)',
    foreground: 'rgb(2, 6, 23)',
    primary: 'rgb(79, 70, 229)',
  },
  {
    choice: 'dark',
    background: 'rgb(2, 6, 23)',
    foreground: 'rgb(248, 250, 252)',
    primary: 'rgb(129, 140, 248)',
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
  });
}
