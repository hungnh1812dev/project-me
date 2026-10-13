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

// Expected values come from the SPEC colour table (Strapi palette).
for (const { choice, background, foreground, primary, primaryInk } of [
  {
    choice: 'light',
    background: 'rgb(246, 246, 249)', // #F6F6F9
    foreground: 'rgb(50, 50, 77)', // #32324D
    primary: 'rgb(73, 69, 255)', // #4945FF
    primaryInk: 'rgb(73, 69, 255)', // #4945FF
  },
  {
    choice: 'dark',
    background: 'rgb(24, 24, 38)', // #181826
    foreground: 'rgb(255, 255, 255)', // #FFFFFF
    primary: 'rgb(73, 69, 255)', // #4945FF
    primaryInk: 'rgb(154, 152, 255)', // #9A98FF
  },
]) {
  test(`the shared @repo/form-commons theme tokens reach the page in the ${choice} theme`, async ({
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

test('classes used only inside @repo/form-commons reach the app stylesheet on /login (AC-5)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 812 });
  await page.goto('/login');

  // PasswordInput adds the class `pr` + `-12` (padding-right 48px) to its input to make room for the
  // show/hide toggle. No file under apps/cms-admin/src uses that class, so it only exists if
  // globals.css has the @source line for packages/form-commons/src. The name is split here on
  // purpose: Tailwind also scans e2e/, and a literal copy would generate the class by itself.
  const password = page.getByLabel('Password', { exact: true });
  await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
  await expect(password).toHaveCSS('padding-right', '48px');
});
