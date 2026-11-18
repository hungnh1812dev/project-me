import { expect, test } from '@playwright/test';

import { ADMIN_COPY, API_ENDPOINTS } from '../src/Apps.contract';
import { SLOW_STATE_TEST_TIMEOUT_MS, SLOW_STATE_TIMEOUT_MS } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { signInAsOwner } from '../src/Session.fixture';

const HEALTH_URL = `${e2eEnv.apiBaseUrl}${API_ENDPOINTS.HEALTH.LIVE}`;

test.describe('status card', { tag: ['@cms-admin', '@cms-api'] }, () => {
  test('the status card shows the API as operational with its health URL', async ({ page }) => {
    await signInAsOwner(page);

    await expect(page.getByText(ADMIN_COPY.status.state.ok)).toBeVisible();
    await expect(page.getByText(API_ENDPOINTS.HEALTH.LIVE)).toBeVisible();
  });

  test('a failed health call shows the error and Check again recovers', async ({ page }) => {
    test.setTimeout(SLOW_STATE_TEST_TIMEOUT_MS);
    await page.route(HEALTH_URL, (route) => route.abort());
    await signInAsOwner(page);

    // The card retries the failed call before it shows the error.
    await expect(page.getByText(ADMIN_COPY.status.state.error)).toBeVisible({
      timeout: SLOW_STATE_TIMEOUT_MS,
    });
    await expect(page.getByText(ADMIN_COPY.status.errorHint)).toBeVisible();

    await page.unroute(HEALTH_URL);
    await page.getByRole('button', { name: ADMIN_COPY.status.checkAgain }).click();

    await expect(page.getByText(ADMIN_COPY.status.state.ok)).toBeVisible();
    await expect(page.getByText(ADMIN_COPY.status.errorHint)).toHaveCount(0);
  });
});
