import { expect, type Page, test } from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import { API_ENDPOINTS } from '../../cms-admin/src/config/endpoints';
import { e2eEnv } from '../src/env';

const HEALTH_URL = `${e2eEnv.apiBaseUrl}${API_ENDPOINTS.HEALTH.LIVE}`;

async function signInToHome(page: Page) {
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page.getByLabel(COPY.login.passwordLabel).fill(e2eEnv.ownerPassword);
  await page.getByRole('button', { name: COPY.login.submit }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: COPY.page.title }),
  ).toBeVisible();
}

test('the status card shows the API as operational with its health URL', async ({
  page,
}) => {
  await signInToHome(page);

  await expect(page.getByText(COPY.status.state.ok)).toBeVisible();
  await expect(page.getByText(API_ENDPOINTS.HEALTH.LIVE)).toBeVisible();
});

test('a failed health call shows the error and Check again recovers', async ({
  page,
}) => {
  await page.route(HEALTH_URL, (route) => route.abort());
  await signInToHome(page);

  await expect(page.getByText(COPY.status.state.error)).toBeVisible();
  await expect(page.getByText(COPY.status.errorHint)).toBeVisible();

  await page.unroute(HEALTH_URL);
  await page.getByRole('button', { name: COPY.status.checkAgain }).click();

  await expect(page.getByText(COPY.status.state.ok)).toBeVisible();
  await expect(page.getByText(COPY.status.errorHint)).toHaveCount(0);
});
