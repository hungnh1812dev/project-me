import { expect, type Page, test } from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import { PASSWORD_PATHS } from '../src/constants';
import { e2eEnv } from '../src/env';
import { mailIdsFor, waitForCode } from '../src/mailpit';

const HTTP_ACCEPTED = 202;
const HTTP_NO_CONTENT = 204;
/** A different password of a valid length (12-128) for this run. */
const TEMPORARY_PASSWORD = `${e2eEnv.ownerPassword.slice(0, 100)}-reset`;

const label = (name: string) => new RegExp(`^${name}`);

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
    { url: `${e2eEnv.apiBaseUrl}${path}`, payload: body },
  );
}

async function signIn(page: Page, password: string) {
  await page
    .getByRole('textbox', { name: COPY.login.emailLabel })
    .fill(e2eEnv.ownerEmail);
  await page.getByLabel(COPY.login.passwordLabel).fill(password);
  await page.getByRole('button', { name: COPY.login.submit }).click();
}

test('the owner resets a forgotten password with an emailed code', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page.getByRole('link', { name: COPY.login.forgotPassword }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: COPY.password.reset.requestTitle,
    }),
  ).toBeVisible();

  // Step 1: ask for a code.
  const seen = await mailIdsFor(context, e2eEnv.ownerEmail);
  await page
    .getByLabel(label(COPY.password.emailLabel))
    .fill(e2eEnv.ownerEmail);
  await page
    .getByRole('button', { name: COPY.password.reset.sendCode })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: COPY.password.reset.title }),
  ).toBeFocused();

  // Step 2: the code from Mailpit plus the new password.
  const code = await waitForCode(context, e2eEnv.ownerEmail, seen);
  await page.getByLabel(label(COPY.password.codeLabel)).fill(code);
  await page
    .getByLabel(label(COPY.password.newPasswordLabel))
    .fill(TEMPORARY_PASSWORD);
  await page
    .getByLabel(label(COPY.password.confirmPasswordLabel))
    .fill(TEMPORARY_PASSWORD);
  await page.getByRole('button', { name: COPY.password.reset.submit }).click();

  await expect(page.getByRole('status')).toHaveText(
    COPY.login.notices.passwordReset,
  );
  await expect(page).toHaveURL(/\/login$/);

  // The new password works. (Old password -> 401 is covered by the cms-api
  // integration tests; skipping it here keeps owner logins under the
  // 5-per-15-min email limit across smoke + e2e.)
  await signIn(page, TEMPORARY_PASSWORD);
  await expect(
    page.getByRole('heading', { level: 1, name: COPY.page.title }),
  ).toBeVisible();

  // Put the original password back for the other specs and later runs.
  const before = await mailIdsFor(context, e2eEnv.ownerEmail);
  expect(
    await postFromAdmin(page, PASSWORD_PATHS.REQUEST_OTP, {
      email: e2eEnv.ownerEmail,
    }),
  ).toBe(HTTP_ACCEPTED);
  const restoreCode = await waitForCode(context, e2eEnv.ownerEmail, before);
  expect(
    await postFromAdmin(page, PASSWORD_PATHS.RESET, {
      email: e2eEnv.ownerEmail,
      code: restoreCode,
      newPassword: e2eEnv.ownerPassword,
    }),
  ).toBe(HTTP_NO_CONTENT);

  // The reset ended this session too: the next API call sends us to sign in.
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: COPY.login.title }),
  ).toBeVisible();
});
