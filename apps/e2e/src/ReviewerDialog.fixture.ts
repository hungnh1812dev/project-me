import { type APIRequestContext, expect, type Page } from '@playwright/test';

import { ADMIN_COPY, WEB_COPY } from './AppContracts.contract';
import { API_PATHS, apiUrl } from './ApiPaths.constants';
import { HTTP } from './E2e.constants';
import { labelStartingWith } from './Locators.fixture';
import { bearer } from './Session.fixture';

export const reviewerCopy = WEB_COPY.reviewer;
export const reviewerAdminCopy = ADMIN_COPY.reviewer;
export const TURNSTILE_HOST = '**/challenges.cloudflare.com/**';

export const openButton = (page: Page) =>
  page.getByRole('button', { name: reviewerCopy.open, exact: true });
export const dialog = (page: Page) =>
  page.getByRole('dialog', { name: reviewerCopy.title });
export const next = (page: Page) =>
  dialog(page).getByRole('button', { name: reviewerCopy.next, exact: true });
export const submit = (page: Page) =>
  dialog(page).getByRole('button', { name: reviewerCopy.submit, exact: true });
export const step = (page: Page, n: number) =>
  dialog(page).getByText(reviewerCopy.stepLabel(n, 3));

export async function setEnabled(
  request: APIRequestContext,
  token: string,
  enabled: boolean,
): Promise<void> {
  const response = await request.put(apiUrl(API_PATHS.REVIEWER.SETTINGS), {
    headers: bearer(token),
    data: { enabled },
  });
  expect(response.status()).toBe(HTTP.OK);
}

/** Walks steps 1 and 2 with the given answers and lands on step 3. */
export async function reachNotesStep(
  page: Page,
  role: string,
  purpose?: string,
): Promise<void> {
  await dialog(page)
    .getByLabel(labelStartingWith(reviewerCopy.role.label))
    .selectOption(role);
  await next(page).click();
  if (purpose !== undefined) {
    await dialog(page).getByLabel(purpose, { exact: true }).check();
  }
  await next(page).click();
  await expect(step(page, 3)).toBeVisible();
}
