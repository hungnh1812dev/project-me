import { expect, test, type APIRequestContext } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { HTTP } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';

const HEADER_SLUG = 'header';
const MODULE_NOT_FOUND_SLUG = 'module-not-found';
/** Next dev mode applies inline styles the web CSP refuses, on every page (not from the header); the production build does not. */
const RSC_PREFETCH_PARAM = '_rsc=';
const DEV_INLINE_STYLE_CSP_NOISE =
  'Applying inline style violates the following Content Security Policy';

/**
 * apps/web header and not-found page on the content the cms-api serves: the brand is `appName`, entries
 * come from `navs` with their `subNavs`, an entry with a role stays out of the page for a signed-out
 * visitor (display only, D3), sub entries open by keyboard, and an unknown URL shows `moduleNotFound`.
 * The spec publishes its own header and module-not-found (newest wins) and removes both afterwards.
 */
test.describe(
  'site header and not-found page',
  { tag: ['@web', '@cms-api', '@public-site'] },
  () => {
    test.describe.configure({ mode: 'serial', retries: 0 });

    const stamp = Date.now();
    const APP_NAME = `E2E App ${stamp}`;
    const NOT_FOUND_TITLE = `E2E Missing ${stamp}`;
    const NOT_FOUND_DESCRIPTION = `E2E nothing here ${stamp}`;
    const PUBLIC_TITLE = 'E2E Public';
    const SUB_PUBLIC_TITLE = 'E2E Sub Public';
    const SUB_ADMIN_TITLE = 'E2E Sub Admin';
    const ADMIN_TITLE = 'E2E Admin Only';
    const LAST_PUBLIC_TITLE = 'E2E Last';

    let ownerToken = '';
    const created: [string, string][] = [];

    const ownerHeaders = () => ({ authorization: `Bearer ${ownerToken}` });

    const publish = async (
      request: APIRequestContext,
      slug: string,
      data: unknown,
    ): Promise<void> => {
      const response = await request.post(apiUrl(API_PATHS.documents(slug)), {
        headers: ownerHeaders(),
        data,
      });
      const draft = (await response.json()) as { documentId: string; version: number };
      created.push([slug, draft.documentId]);
      await request.post(apiUrl(API_PATHS.documentPublish(slug, draft.documentId)), {
        headers: ownerHeaders(),
        data: { expectedVersion: draft.version },
      });
    };

    test.beforeAll(async ({ request }) => {
      const login = await request.post(apiUrl(API_PATHS.AUTH.LOGIN), {
        data: { email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword },
      });
      ownerToken = ((await login.json()) as { accessToken: string }).accessToken;
      await publish(request, HEADER_SLUG, {
        values: { appName: APP_NAME },
        components: {
          navs: [
            {
              values: { title: PUBLIC_TITLE, link: '/cv', requiresRole: 'public' },
              components: {
                subNavs: [
                  { values: { title: SUB_PUBLIC_TITLE, link: '/status', requiresRole: 'public' } },
                  { values: { title: SUB_ADMIN_TITLE, link: '/cv', requiresRole: 'admin' } },
                ],
              },
            },
            { values: { title: ADMIN_TITLE, link: '/status', requiresRole: 'admin' } },
            { values: { title: LAST_PUBLIC_TITLE, link: '/status', requiresRole: 'public' } },
          ],
          author: [{ values: { btnLoginText: 'Sign in', btnLogoutText: 'Sign out' } }],
        },
      });
      await publish(request, MODULE_NOT_FOUND_SLUG, {
        values: { title: NOT_FOUND_TITLE, description: NOT_FOUND_DESCRIPTION },
      });
    });

    test.afterAll(async ({ request }) => {
      for (const [slug, documentId] of created) {
        const removed = await request.delete(apiUrl(API_PATHS.document(slug, documentId)), {
          headers: ownerHeaders(),
        });
        expect(removed.status()).toBe(HTTP.NO_CONTENT);
      }
    });

    test('signed out: brand and title are appName, public entries show, role entries are not in the page, console clean', async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes(DEV_INLINE_STYLE_CSP_NOISE))
          consoleErrors.push(message.text());
      });
      // Next.js cancels its own link prefetches (?_rsc=) in the production build; that is not a failure.
      page.on('requestfailed', (request) => {
        if (!request.url().includes(RSC_PREFETCH_PARAM)) failedRequests.push(request.url());
      });
      page.on('response', (response) => {
        if (response.status() >= HTTP.BAD_REQUEST) failedRequests.push(response.url());
      });

      await page.goto(e2eEnv.webUrl);
      await expect(page).toHaveTitle(APP_NAME);
      await expect(page.getByText(APP_NAME, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: PUBLIC_TITLE, exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: LAST_PUBLIC_TITLE, exact: true })).toBeVisible();
      await expect(
        page.getByRole('link', { name: SUB_PUBLIC_TITLE, exact: true, includeHidden: true }),
      ).toHaveCount(1);
      await expect(
        page.getByRole('link', { name: ADMIN_TITLE, exact: true, includeHidden: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: SUB_ADMIN_TITLE, exact: true, includeHidden: true }),
      ).toHaveCount(0);
      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    });

    test('keyboard: Tab reaches the entry, then its sub entry; Escape closes the sub menu', async ({
      page,
    }) => {
      await page.goto(e2eEnv.webUrl);
      const entry = page.getByRole('link', { name: PUBLIC_TITLE, exact: true });
      const sub = page.getByRole('link', {
        name: SUB_PUBLIC_TITLE,
        exact: true,
        includeHidden: true,
      });
      const last = page.getByRole('link', { name: LAST_PUBLIC_TITLE, exact: true });
      await expect(sub).toBeHidden();
      await entry.focus();
      await expect(sub).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(sub).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(sub).toBeHidden();
      await page.keyboard.press('Tab');
      await expect(last).toBeFocused();
    });

    test('an unknown URL answers 404 with the moduleNotFound title and description', async ({
      page,
    }) => {
      const response = await page.goto(`${e2eEnv.webUrl}/e2e-no-such-page-${stamp}`);
      expect(response?.status()).toBe(HTTP.NOT_FOUND);
      await expect(page.getByText(NOT_FOUND_TITLE, { exact: true })).toBeVisible();
      await expect(page.getByText(NOT_FOUND_DESCRIPTION, { exact: true })).toBeVisible();
      await expect(page.getByText(APP_NAME, { exact: true }).first()).toBeVisible();
    });
  },
);
