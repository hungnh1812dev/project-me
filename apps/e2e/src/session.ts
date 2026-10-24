import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { ADMIN_COPY } from './app-contracts';
import { API_PATHS, apiUrl } from './api-paths';
import { HTTP } from './constants';
import { e2eEnv } from './env';

/** Opens the login page and submits the form; does not wait for the result. */
export async function submitLogin(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: ADMIN_COPY.login.emailLabel })
    .fill(email);
  await page.getByLabel(ADMIN_COPY.login.passwordLabel).fill(password);
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
}

/** Waits for the signed-in shell (the sign-out button). */
export async function expectSignedIn(page: Page): Promise<void> {
  await expect(
    page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
  ).toBeVisible();
}

/** Signs in through the admin login form and waits for the shell. */
export async function signInAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await submitLogin(page, email, password);
  await expectSignedIn(page);
}

export const signInAsOwner = (page: Page): Promise<void> =>
  signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);

/** Access token of the owner, from the login API. */
export async function ownerApiToken(
  request: APIRequestContext,
): Promise<string> {
  const response = await request.post(apiUrl(API_PATHS.AUTH.LOGIN), {
    data: { email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword },
  });
  expect(response.status()).toBe(HTTP.OK);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

export const bearer = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});
