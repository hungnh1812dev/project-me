import { expect, test } from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import { APP_ROUTES } from '../../cms-admin/src/config/routes';
import { HTTP } from '../src/constants';
import { e2eEnv } from '../src/env';

/**
 * SPEC §12-1, closed state: the smoke stack already has its owner (smoke.sh
 * created it through the setup route), so the setup page and route must be
 * gone. The open state needs an empty database and is checked by hand.
 *
 * The submit route allows 5 requests per 15 min per IP and smoke spends 3, so
 * this spec sends at most 2 submits. A rerun against a kept stack inside the
 * window gets 429 instead of 404.
 */
const SETUP_OWNER_URL = `${e2eEnv.apiBaseUrl}/setup/owner`;
const UNUSED_TOKEN = 'e2e-token-that-is-not-the-setup-token';
const OWNER_BODY = {
  email: `setup-closed@${new URL(e2eEnv.webUrl).hostname}`,
  password: 'a-long-unused-password-for-e2e',
};

test('/setup redirects to /login and the login page offers no setup', async ({
  page,
}) => {
  await page.goto(APP_ROUTES.SETUP);

  await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.LOGIN}$`));
  await expect(
    page.getByRole('heading', { level: 1, name: COPY.login.title }),
  ).toBeVisible();
  await expect(page.getByText(COPY.login.setupPrompt.message)).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: COPY.login.setupPrompt.action }),
  ).toHaveCount(0);
  await expect(page.getByText(COPY.login.notices.ownerCreated)).toHaveCount(0);
});

test('the setup status is closed and a submit is answered like an unknown route', async ({
  request,
}) => {
  const status = await request.get(`${e2eEnv.apiBaseUrl}/setup/status`);
  expect(status.status()).toBe(HTTP.OK);
  expect(await status.json()).toEqual({ open: false });

  for (const body of [
    { ...OWNER_BODY, setupToken: UNUSED_TOKEN },
    OWNER_BODY,
  ]) {
    const res = await request.post(SETUP_OWNER_URL, { data: body });
    expect(res.status()).toBe(HTTP.NOT_FOUND);
    expect(JSON.stringify(await res.json())).not.toContain(UNUSED_TOKEN);
  }
});
