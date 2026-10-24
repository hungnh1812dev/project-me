import { expect, test } from '@playwright/test';

import { ADMIN_COPY, API_ENDPOINTS } from '../src/app-contracts';
import { e2eEnv } from '../src/env';
import { signInAsOwner } from '../src/session';

const HEALTH_URL = `${e2eEnv.apiBaseUrl}${API_ENDPOINTS.HEALTH.LIVE}`;

test('the status card shows the API as operational with its health URL', async ({
  page,
}) => {
  await signInAsOwner(page);

  await expect(page.getByText(ADMIN_COPY.status.state.ok)).toBeVisible();
  await expect(page.getByText(API_ENDPOINTS.HEALTH.LIVE)).toBeVisible();
});

test('a failed health call shows the error and Check again recovers', async ({
  page,
}) => {
  await page.route(HEALTH_URL, (route) => route.abort());
  await signInAsOwner(page);

  await expect(page.getByText(ADMIN_COPY.status.state.error)).toBeVisible();
  await expect(page.getByText(ADMIN_COPY.status.errorHint)).toBeVisible();

  await page.unroute(HEALTH_URL);
  await page
    .getByRole('button', { name: ADMIN_COPY.status.checkAgain })
    .click();

  await expect(page.getByText(ADMIN_COPY.status.state.ok)).toBeVisible();
  await expect(page.getByText(ADMIN_COPY.status.errorHint)).toHaveCount(0);
});
