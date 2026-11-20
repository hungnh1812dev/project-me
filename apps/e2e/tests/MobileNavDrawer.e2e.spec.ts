import { expect, test, type APIRequestContext } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { HTTP } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { withHumanCheck } from '../src/Session.fixture';

const HEADER_SLUG = 'header';
const DEV_INLINE_STYLE_CSP_NOISE =
  'Applying inline style violates the following Content Security Policy';
const PHONE_VIEWPORT = { width: 390, height: 844 };
const SMALLEST_PHONE_WIDTH = 320;
const MD_WIDTH = 768;
const BELOW_MD_WIDTH = 767;

/**
 * apps/web header on phones: below `md` the bar holds the menu button instead of the entries; the button
 * opens a side dialog with the same entries (a link-less parent is a heading), which closes by the close
 * button, Escape, a backdrop tap and a link tap, and the bar shows the entries again from `md`.
 * The spec publishes its own header (newest wins) and removes it afterwards.
 */
test.describe('mobile nav drawer', { tag: ['@web', '@cms-api', '@public-site'] }, () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  const stamp = Date.now();
  const APP_NAME = `E2E Drawer ${stamp}`;
  const LINK_TITLE = 'E2E Drawer Link';
  const SUB_TITLE = 'E2E Drawer Sub';
  const HEADING_TITLE = 'E2E Drawer Heading';
  const HEADING_SUB_TITLE = 'E2E Drawer Heading Sub';

  let ownerToken = '';
  const created: [string, string][] = [];

  const publishHeader = async (request: APIRequestContext): Promise<void> => {
    const headers = { authorization: `Bearer ${ownerToken}` };
    const response = await request.post(apiUrl(API_PATHS.documents(HEADER_SLUG)), {
      headers,
      data: {
        values: { appName: APP_NAME },
        components: {
          navs: [
            {
              values: { title: LINK_TITLE, link: '/cv', requiresRole: 'public' },
              components: {
                subNavs: [
                  { values: { title: SUB_TITLE, link: '/status', requiresRole: 'public' } },
                ],
              },
            },
            {
              values: { title: HEADING_TITLE },
              components: { subNavs: [{ values: { title: HEADING_SUB_TITLE, link: '/status' } }] },
            },
          ],
          author: [{ values: { btnLoginText: 'Sign in', btnLogoutText: 'Sign out' } }],
        },
      },
    });
    const draft = (await response.json()) as { documentId: string; version: number };
    created.push([HEADER_SLUG, draft.documentId]);
    await request.post(apiUrl(API_PATHS.documentPublish(HEADER_SLUG, draft.documentId)), {
      headers,
      data: { expectedVersion: draft.version },
    });
  };

  test.beforeAll(async ({ request }) => {
    const login = await request.post(apiUrl(API_PATHS.AUTH.LOGIN), {
      data: withHumanCheck({ email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword }),
    });
    ownerToken = ((await login.json()) as { accessToken: string }).accessToken;
    await publishHeader(request);
  });

  test.afterAll(async ({ request }) => {
    for (const [slug, documentId] of created) {
      const removed = await request.delete(apiUrl(API_PATHS.document(slug, documentId)), {
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(removed.status()).toBe(HTTP.NO_CONTENT);
    }
  });

  test.describe('phone', () => {
    test.use({ hasTouch: true, viewport: PHONE_VIEWPORT });

    test('the bar holds the menu button only, the drawer lists the entries and closes every way', async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes(DEV_INLINE_STYLE_CSP_NOISE))
          consoleErrors.push(message.text());
      });
      await page.goto(e2eEnv.webUrl);
      const openButton = page.getByRole('button', { name: 'Open menu' });
      const dialog = page.getByRole('dialog', { name: APP_NAME });
      await expect(openButton).toBeVisible();
      await expect(page.getByRole('link', { name: LINK_TITLE, exact: true })).toBeHidden();

      await openButton.tap();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('link', { name: LINK_TITLE, exact: true })).toBeVisible();
      await expect(dialog.getByRole('link', { name: SUB_TITLE, exact: true })).toBeVisible();
      await expect(dialog.getByText(HEADING_TITLE, { exact: true })).toBeVisible();
      await expect(dialog.getByRole('link', { name: HEADING_TITLE, exact: true })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: HEADING_TITLE, exact: true })).toHaveCount(0);
      await expect(
        dialog.getByRole('link', { name: HEADING_SUB_TITLE, exact: true }),
      ).toBeVisible();

      await dialog.getByRole('button', { name: 'Close menu' }).tap();
      await expect(dialog).toBeHidden();
      await expect(openButton).toBeFocused();

      await openButton.tap();
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(openButton).toBeFocused();

      await openButton.tap();
      await expect(dialog).toBeVisible();
      await page.touchscreen.tap(10, PHONE_VIEWPORT.height / 2);
      await expect(dialog).toBeHidden();

      await openButton.tap();
      await dialog.getByRole('link', { name: LINK_TITLE, exact: true }).tap();
      await expect(page).toHaveURL(/\/cv$/);
      await expect(dialog).toBeHidden();
      expect(consoleErrors).toEqual([]);
    });
  });

  test.describe('width switch', () => {
    test('below md only the menu button shows, from md only the bar entries; widening closes the drawer', async ({
      page,
    }) => {
      await page.setViewportSize({ width: BELOW_MD_WIDTH, height: PHONE_VIEWPORT.height });
      await page.goto(e2eEnv.webUrl);
      const openButton = page.getByRole('button', { name: 'Open menu' });
      const barEntry = page.getByRole('link', { name: LINK_TITLE, exact: true });
      await expect(openButton).toBeVisible();
      await expect(barEntry).toBeHidden();

      await openButton.click();
      const dialog = page.getByRole('dialog', { name: APP_NAME });
      await expect(dialog).toBeVisible();
      await page.setViewportSize({ width: MD_WIDTH, height: PHONE_VIEWPORT.height });
      await expect(dialog).toBeHidden();
      await expect(openButton).toBeHidden();
      await expect(barEntry).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.body).pointerEvents))
        .not.toBe('none');
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
        .not.toBe('hidden');
    });
  });
  test.describe('phone layout and access', () => {
    test.use({ viewport: PHONE_VIEWPORT });

    test('no horizontal overflow at the smallest phone width', async ({ page }) => {
      await page.setViewportSize({ width: SMALLEST_PHONE_WIDTH, height: PHONE_VIEWPORT.height });
      await page.goto(e2eEnv.webUrl);
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('signed in as a reader: the bar holds the account menu and the menu button, no overflow at the smallest width', async ({
      page,
    }) => {
      await page.setViewportSize({ width: SMALLEST_PHONE_WIDTH, height: PHONE_VIEWPORT.height });
      await page.goto(e2eEnv.webUrl);
      await page.getByRole('button', { name: 'Sign in' }).click();
      const signIn = page.getByRole('dialog', { name: 'Sign in' });
      // The human-check widget fills this hidden input when its token is ready; a submit before that does nothing.
      await expect(signIn.locator('input[name="cf-turnstile-response"]')).not.toHaveValue('');
      await signIn.getByRole('textbox', { name: 'Email' }).fill(e2eEnv.readerEmail);
      await signIn.getByRole('textbox', { name: 'Password' }).fill(e2eEnv.readerPassword);
      await signIn.getByRole('button', { name: 'Sign in' }).click();
      await expect(signIn).toBeHidden();
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
      await expect(page.getByRole('link', { name: LINK_TITLE, exact: true })).toBeHidden();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('keyboard: Enter and Space open it, Tab stays inside, Escape returns focus', async ({
      page,
    }) => {
      await page.goto(e2eEnv.webUrl);
      const openButton = page.getByRole('button', { name: 'Open menu' });
      const dialog = page.getByRole('dialog', { name: APP_NAME });
      for (const key of ['Enter', 'Space']) {
        await openButton.focus();
        await page.keyboard.press(key);
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(openButton).toBeFocused();
      }
      await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
      for (let step = 0; step < 8; step += 1) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
      }
    });

    test('print shows neither the button nor the drawer; reduced motion drops the slide', async ({
      page,
    }) => {
      await page.goto(e2eEnv.webUrl);
      const openButton = page.getByRole('button', { name: 'Open menu' });
      const dialog = page.getByRole('dialog', { name: APP_NAME });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openButton.click();
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS('transition-property', 'none');
      await page.emulateMedia({ media: 'print' });
      await expect(dialog).toBeHidden();
      await page.emulateMedia({ media: 'screen' });
      await page.keyboard.press('Escape');
      await page.emulateMedia({ media: 'print' });
      await expect(openButton).toBeHidden();
    });

    test.describe('without JavaScript', () => {
      test.use({ javaScriptEnabled: false });

      test('the first paint holds the menu button and no bar entry', async ({ page }) => {
        await page.goto(e2eEnv.webUrl);
        await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
        await expect(page.getByRole('link', { name: LINK_TITLE, exact: true })).toBeHidden();
      });
    });
  });
});
