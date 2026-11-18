import { expect, test, type Page } from '@playwright/test';

import { ADMIN_COPY, API_ENDPOINTS, APP_ROUTES } from '../src/Apps.contract';
import { HTTP } from '../src/E2e.constants';
import { signInAsOwner } from '../src/Session.fixture';

const copy = ADMIN_COPY.backups;
const LIST_URL = `**${API_ENDPOINTS.BACKUPS.LIST}`;
const SERVER_ERROR = 500;
const LOADING_DELAY_MS = 1500;
const ERROR_WAIT_MS = 20_000;
const OVERFLOW_TOLERANCE_PX = 1;
const VIEWPORTS = [
  { width: 375, height: 800 },
  { width: 1280, height: 800 },
];
const LISTED = {
  data: [
    {
      key: 'backups/abyss-2026-10-27T03-00-00Z.dump.age',
      kind: 'daily',
      fileName: 'abyss-2026-10-27T03-00-00Z.dump.age',
      createdAt: '2026-10-27T03:00:00.000Z',
      sizeBytes: 1024,
    },
  ],
  meta: { count: 1, totalBytes: 1024, latestAt: '2026-10-27T03:00:00.000Z', isStale: false },
};
const EMPTY = { data: [], meta: { count: 0, totalBytes: 0, latestAt: null, isStale: false } };

const isListFetch = (route: {
  request: () => { method: () => string; resourceType: () => string };
}) =>
  route.request().method() === 'GET' && ['fetch', 'xhr'].includes(route.request().resourceType());

const cardState = (page: Page) =>
  page.evaluate(() => {
    const cards = [...document.querySelectorAll('main [data-slot="card"]')];
    return {
      count: cards.length,
      nested: cards.some((el) => Boolean(el.parentElement?.closest('[data-slot="card"]'))),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

async function expectOneCard(page: Page) {
  const state = await cardState(page);
  expect(state.nested).toBe(false);
  expect(state.count).toBeGreaterThanOrEqual(1);
  expect(state.overflow).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
}

const checkButton = (page: Page) => page.getByRole('button', { name: copy.check.button });

for (const viewport of VIEWPORTS) {
  test.describe(
    `backups card states at ${viewport.width}px`,
    { tag: ['@cms-admin', '@cms-api', '@backups'] },
    () => {
      test.use({ viewport });

      test('first state: hint and button in one card, no list request before the press, keyboard press', async ({
        page,
      }) => {
        let listRequests = 0;
        await page.route(LIST_URL, (route) => {
          if (isListFetch(route)) {
            listRequests += 1;
            return route.fulfill({ status: HTTP.OK, json: LISTED });
          }
          return route.fallback();
        });
        await signInAsOwner(page);
        await page.goto(APP_ROUTES.BACKUPS);
        const button = checkButton(page);
        await expect(button).toBeVisible();
        const sharedCard = page.locator('[data-slot="card"]').filter({ has: button });
        await expect(sharedCard).toHaveCount(1);
        await expect(sharedCard).toContainText(copy.check.hint);
        await expectOneCard(page);
        expect(listRequests).toBe(0);

        await button.focus();
        await expect(button).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('table', { name: copy.tableLabel })).toBeVisible();
        expect(listRequests).toBe(1);
        await expectOneCard(page);
      });

      test('loading and empty states stay in one card', async ({ page }) => {
        await signInAsOwner(page);

        await page.route(LIST_URL, async (route) => {
          if (!isListFetch(route)) return route.fallback();
          await new Promise((resolve) => setTimeout(resolve, LOADING_DELAY_MS));
          return route.fulfill({ status: HTTP.OK, json: EMPTY });
        });
        await page.goto(APP_ROUTES.BACKUPS);
        await checkButton(page).click();
        await expectOneCard(page);
        await expect(page.getByText(copy.empty, { exact: true })).toBeVisible();
        await expectOneCard(page);
        await page.unroute(LIST_URL);
      });

      test('error state stays in one card', async ({ page }) => {
        await signInAsOwner(page);
        await page.route(LIST_URL, (route) =>
          isListFetch(route)
            ? route.fulfill({ status: SERVER_ERROR, json: { errorCode: 'INTERNAL' } })
            : route.fallback(),
        );
        await page.goto(APP_ROUTES.BACKUPS);
        await checkButton(page).click();
        await expect(page.getByText(copy.loadFailed)).toBeVisible({ timeout: ERROR_WAIT_MS });
        await expectOneCard(page);
        await page.unroute(LIST_URL);
      });

      test('not-configured state stays in one card', async ({ page }) => {
        await signInAsOwner(page);
        await page.goto(APP_ROUTES.BACKUPS);
        await checkButton(page).click();
        await expect(page.getByText(copy.notConfigured.title)).toBeVisible();
        await expectOneCard(page);
      });
    },
  );
}
