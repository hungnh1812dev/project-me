import { expect, test } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { ADMIN_COPY, contentListPath, contentNewPath } from '../src/Apps.contract';
import { CONTENT_TYPE_NAMES, CV_PAGE_NAME, CV_PAGE_SLUG } from '../src/E2e.constants';
import { bearer, ownerApiToken, signInAsOwner } from '../src/Session.fixture';

const copy = ADMIN_COPY.content;
const CONTENT_TYPES_PATH = '/content-types';
const LONG_NAME = 'Curriculum Vitae Page With A Very Long Display Name 60 Chars';
const LOADING_DELAY_MS = 1_500;
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 700 };

const typeUrl = new RegExp(`${CONTENT_TYPES_PATH}/${CV_PAGE_SLUG}$`);
const listUrl = new RegExp(`${CONTENT_TYPES_PATH}$`);

test.describe(
  'content type display names on screens',
  { tag: ['@cms-admin', '@cms-api', '@content-editing'] },
  () => {
    test('list, new, edit and single type titles show the name, never the slug', async ({
      page,
      request,
    }) => {
      await page.setViewportSize(DESKTOP);
      await signInAsOwner(page);
      await page.goto(contentListPath(CV_PAGE_SLUG));
      await expect(page.getByRole('heading', { level: 1, name: CV_PAGE_NAME })).toBeVisible();
      await expect(page.getByRole('table', { name: `${CV_PAGE_NAME} documents` })).toBeAttached();
      await expect(page.getByRole('heading', { level: 1, name: CV_PAGE_SLUG })).toHaveCount(0);

      await page.goto(contentNewPath(CV_PAGE_SLUG));
      await expect(
        page.getByRole('heading', { level: 1, name: copy.newTitle(CV_PAGE_NAME) }),
      ).toBeVisible();

      const token = await ownerApiToken(request);
      const documents = await request.get(apiUrl(API_PATHS.documents(CV_PAGE_SLUG)), {
        headers: bearer(token),
      });
      const first = ((await documents.json()) as { data?: { id: string }[] }).data?.[0];
      if (first !== undefined) {
        await page.goto(`/content/${CV_PAGE_SLUG}/${first.id}`);
        await expect(
          page.getByRole('heading', { level: 1, name: copy.editTitle(CV_PAGE_NAME) }),
        ).toBeVisible();
      }

      await page.goto(contentListPath('header'));
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: new RegExp(`^(New|Edit) ${CONTENT_TYPE_NAMES.header}$`),
        }),
      ).toBeVisible();
    });

    test('a slow content type shows a skeleton, never the slug', async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await signInAsOwner(page);
      await page.route(typeUrl, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, LOADING_DELAY_MS));
        await route.continue();
      });
      await page.goto(contentListPath(CV_PAGE_SLUG));
      await expect(page.getByText(copy.titleLoading)).toBeAttached();
      await expect(page.getByRole('heading', { level: 1, name: /cv-page/i })).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1, name: CV_PAGE_NAME })).toBeVisible();
    });

    for (const viewport of [DESKTOP, PHONE]) {
      test(`a 60-character name wraps inside the viewport at ${viewport.width} px`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.route(typeUrl, async (route) => {
          const response = await route.fetch();
          const body = (await response.json()) as Record<string, unknown>;
          await route.fulfill({ response, json: { ...body, displayName: LONG_NAME } });
        });
        await page.route(listUrl, async (route) => {
          const response = await route.fetch();
          const body = (await response.json()) as unknown;
          const items = (
            Array.isArray(body) ? body : ((body as { data: unknown[] }).data ?? [])
          ) as {
            slug: string;
          }[];
          const patched = items.map((item) =>
            item.slug === CV_PAGE_SLUG ? { ...item, displayName: LONG_NAME } : item,
          );
          await route.fulfill({
            response,
            json: Array.isArray(body) ? patched : { data: patched },
          });
        });
        await signInAsOwner(page);
        await page.goto(contentListPath(CV_PAGE_SLUG));
        await expect(page.getByRole('heading', { level: 1, name: LONG_NAME })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
          ),
        ).toBe(false);
        const heading = page.getByRole('heading', { level: 1, name: LONG_NAME });
        const box = await heading.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        if (viewport.width === DESKTOP.width) {
          await expect(page.locator(`nav a[title="${LONG_NAME}"]`)).toHaveCount(1);
        }
      });
    }
  },
);
