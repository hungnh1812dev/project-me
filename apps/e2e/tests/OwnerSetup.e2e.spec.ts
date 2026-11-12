import { expect, test, type APIRequestContext } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { ADMIN_COPY, APP_ROUTES } from '../src/Apps.contract';
import { HTTP } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';

/**
 * SPEC §12-1, closed state: the smoke stack already has its owner (smoke.sh
 * created it through the setup route), so the setup page and route must be
 * gone. The open state needs an empty database and is checked by hand.
 *
 * The submit route allows 5 requests per 15 min per IP and smoke spends 3, so
 * this spec sends at most 2 submits. A rerun against a kept stack inside the
 * window gets 429 instead of 404.
 *
 * The status route allows 30 reads per minute per IP and every request behind
 * the proxy shares one bucket, so late in the full suite it can be full; the
 * page test retries the whole visit until the page's own status read gets
 * through, and the API test waits until the route answers again.
 */
const STATUS_WAIT_TIMEOUT_MS = 70_000;
const PAGE_REDIRECT_TIMEOUT_MS = 5_000;
const TEST_TIMEOUT_MS = STATUS_WAIT_TIMEOUT_MS + 30_000;
const STATUS_POLL_INTERVALS_MS = [1_000, 5_000, 10_000];

const SETUP_OWNER_URL = apiUrl(API_PATHS.SETUP.OWNER);
const UNUSED_TOKEN = 'e2e-token-that-is-not-the-setup-token';
const OWNER_BODY = {
  email: `setup-closed@${new URL(e2eEnv.webUrl).hostname}`,
  password: 'a-long-unused-password-for-e2e',
};

async function waitForSetupStatusBudget(request: APIRequestContext): Promise<void> {
  await expect
    .poll(async () => (await request.get(apiUrl(API_PATHS.SETUP.STATUS))).status(), {
      timeout: STATUS_WAIT_TIMEOUT_MS,
      intervals: STATUS_POLL_INTERVALS_MS,
    })
    .toBe(HTTP.OK);
}

test.describe('owner setup', { tag: ['@cms-admin', '@cms-api', '@owner-setup'] }, () => {
  test('/setup redirects to /login and the login page offers no setup', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS);
    await expect(async () => {
      await page.goto(APP_ROUTES.SETUP);
      await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.LOGIN}$`), {
        timeout: PAGE_REDIRECT_TIMEOUT_MS,
      });
    }).toPass({ timeout: STATUS_WAIT_TIMEOUT_MS, intervals: STATUS_POLL_INTERVALS_MS });
    await expect(
      page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title }),
    ).toBeVisible();
    await expect(page.getByText(ADMIN_COPY.login.setupPrompt.message)).toHaveCount(0);
    await expect(page.getByRole('link', { name: ADMIN_COPY.login.setupPrompt.action })).toHaveCount(
      0,
    );
    await expect(page.getByText(ADMIN_COPY.login.notices.ownerCreated)).toHaveCount(0);
  });

  test('the setup status is closed and a submit is answered like an unknown route', async ({
    request,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS);
    await waitForSetupStatusBudget(request);
    const status = await request.get(apiUrl(API_PATHS.SETUP.STATUS));
    expect(status.status()).toBe(HTTP.OK);
    expect(await status.json()).toEqual({ open: false });

    for (const body of [{ ...OWNER_BODY, setupToken: UNUSED_TOKEN }, OWNER_BODY]) {
      const response = await request.post(SETUP_OWNER_URL, { data: body });
      expect(response.status()).toBe(HTTP.NOT_FOUND);
      expect(JSON.stringify(await response.json())).not.toContain(UNUSED_TOKEN);
    }
  });
});
