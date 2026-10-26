import { expect, type Browser, type Page } from '@playwright/test';

import { ADMIN_COPY } from './AppContracts.contract';
import { labelStartingWith } from './Locators.fixture';
import { mailIdsFor, waitForCode } from './Mailpit.client';

interface InvitedAccount {
  email: string;
  name: string;
  role: string;
  password: string;
}

/**
 * Invites an account from the owner's `/accounts` page, sets its password on
 * `/set-password` in a fresh context, and returns that page (not signed in).
 * For specs that need a second account; the invite flow itself is tested in
 * `AccessAdmin.e2e.spec.ts`.
 */
export async function inviteAccount(
  ownerPage: Page,
  browser: Browser,
  account: InvitedAccount,
  onPageError?: (message: string) => void,
): Promise<Page> {
  const access = ADMIN_COPY.access;
  const password = ADMIN_COPY.password;
  const ownerContext = ownerPage.context();

  await ownerPage.goto('/accounts');
  const seen = await mailIdsFor(ownerContext, account.email);
  await ownerPage.getByRole('button', { name: access.accounts.invite }).click();
  const dialog = ownerPage.getByRole('dialog', { name: access.invite.title });
  await dialog
    .getByLabel(labelStartingWith(access.invite.emailLabel))
    .fill(account.email);
  await dialog
    .getByLabel(labelStartingWith(access.invite.displayNameLabel))
    .fill(account.name);
  await dialog
    .getByLabel(labelStartingWith(access.invite.roleLabel))
    .selectOption(account.role);
  await dialog.getByRole('button', { name: access.invite.submit }).click();
  await expect(dialog).toBeHidden();
  const code = await waitForCode(ownerContext, account.email, seen);

  const page = await (await browser.newContext()).newPage();
  if (onPageError !== undefined) {
    page.on('pageerror', (error) => onPageError(error.message));
  }
  await page.goto('/set-password');
  await page
    .getByLabel(labelStartingWith(password.emailLabel))
    .fill(account.email);
  await page.getByLabel(labelStartingWith(password.codeLabel)).fill(code);
  await page
    .getByLabel(labelStartingWith(password.newPasswordLabel))
    .fill(account.password);
  await page
    .getByLabel(labelStartingWith(password.confirmPasswordLabel))
    .fill(account.password);
  await page.getByRole('button', { name: password.set.submit }).click();
  await expect(page.getByRole('status')).toHaveText(
    ADMIN_COPY.login.notices.passwordSet,
  );
  return page;
}
