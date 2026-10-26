import { expect, type Page, test } from '@playwright/test';

import { ADMIN_COPY } from '../src/AppContracts.contract';
import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { HTTP } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { mailIdsFor, waitForCode } from '../src/Mailpit.client';
import { labelStartingWith } from '../src/Locators.fixture';
import { submitLogin } from '../src/Session.fixture';

/** A different password of a valid length (12-128) for this run. */
const TEMPORARY_PASSWORD = `${e2eEnv.ownerPassword.slice(0, 100)}-reset`;

/** POST to cms-api from the admin page, exactly as the admin bundle would (CORS). */
async function postFromAdmin(
  page: Page,
  path: string,
  body: unknown,
): Promise<number> {
  return page.evaluate(
    async ({ url, payload }) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.status;
    },
    { url: apiUrl(path), payload: body },
  );
}

test('the owner resets a forgotten password with an emailed code', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page
    .getByRole('link', { name: ADMIN_COPY.login.forgotPassword })
    .click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: ADMIN_COPY.password.reset.requestTitle,
    }),
  ).toBeVisible();

  // Step 1: ask for a code.
  const seen = await mailIdsFor(context, e2eEnv.ownerEmail);
  await page
    .getByLabel(labelStartingWith(ADMIN_COPY.password.emailLabel))
    .fill(e2eEnv.ownerEmail);
  await page
    .getByRole('button', { name: ADMIN_COPY.password.reset.sendCode })
    .click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: ADMIN_COPY.password.reset.title,
    }),
  ).toBeFocused();

  // Step 2: the code from Mailpit plus the new password.
  const code = await waitForCode(context, e2eEnv.ownerEmail, seen);
  await page
    .getByLabel(labelStartingWith(ADMIN_COPY.password.codeLabel))
    .fill(code);
  await page
    .getByLabel(labelStartingWith(ADMIN_COPY.password.newPasswordLabel))
    .fill(TEMPORARY_PASSWORD);
  await page
    .getByLabel(labelStartingWith(ADMIN_COPY.password.confirmPasswordLabel))
    .fill(TEMPORARY_PASSWORD);
  await page
    .getByRole('button', { name: ADMIN_COPY.password.reset.submit })
    .click();

  await expect(page.getByRole('status')).toHaveText(
    ADMIN_COPY.login.notices.passwordReset,
  );
  await expect(page).toHaveURL(/\/login$/);

  // The new password works. (Old password -> 401 is covered by the cms-api
  // integration tests; skipping it here keeps owner logins under the
  // 5-per-15-min email limit across smoke + e2e.)
  await submitLogin(page, e2eEnv.ownerEmail, TEMPORARY_PASSWORD);
  await expect(
    page.getByRole('heading', { level: 1, name: ADMIN_COPY.page.title }),
  ).toBeVisible();

  // Put the original password back for the other specs and later runs.
  const before = await mailIdsFor(context, e2eEnv.ownerEmail);
  expect(
    await postFromAdmin(page, API_PATHS.AUTH.REQUEST_OTP, {
      email: e2eEnv.ownerEmail,
    }),
  ).toBe(HTTP.ACCEPTED);
  const restoreCode = await waitForCode(context, e2eEnv.ownerEmail, before);
  expect(
    await postFromAdmin(page, API_PATHS.AUTH.PASSWORD_RESET, {
      email: e2eEnv.ownerEmail,
      code: restoreCode,
      newPassword: e2eEnv.ownerPassword,
    }),
  ).toBe(HTTP.NO_CONTENT);

  // The reset ended this session too: the next API call sends us to sign in.
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title }),
  ).toBeVisible();
});
