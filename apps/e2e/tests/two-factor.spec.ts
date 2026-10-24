import { expect, type Locator, type Page, test } from '@playwright/test';

import { COPY } from '../../cms-admin/src/config/copy.constants';
import { TWO_FACTOR_TEST_TIMEOUT_MS } from '../src/constants';
import { e2eEnv } from '../src/env';
import { TWO_FACTOR_CHANGED_PASSWORD as NEW_PASSWORD } from '../src/two-factor-account';
import { mailIdsFor, waitForCode } from '../src/mailpit';
import { freshTotpCode } from '../src/totp';

/**
 * T13 on the dedicated 2FA account (seeded by scripts/smoke.sh), never the
 * owner. Rate-limit budget of this spec, all from one IP within 15 min:
 * 3 logins for this email (limit 5), 4 setup/enable/disable (limit 5),
 * 2 email-code sends (limit 5), 2 verifies (limit 10), 1 password change.
 * Together with smoke + the owner specs the IP stays at 7 of 10 logins.
 * The steps depend on each other and change the account, so no retries.
 */
test.describe.configure({ mode: 'serial', retries: 0 });

const security = COPY.security;
const label = (name: string) => new RegExp(`^${name}`);

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: COPY.login.emailLabel })
    .fill(e2eEnv.twoFactorEmail);
  await page
    .getByLabel(COPY.login.passwordLabel)
    .fill(e2eEnv.twoFactorPassword);
  await page.getByRole('button', { name: COPY.login.submit }).click();
}

/** Signed in: the shell shows. After a sign-out the app returns to the last page. */
async function expectSignedIn(page: Page): Promise<void> {
  await expect(
    page.getByRole('button', { name: COPY.session.signOut }),
  ).toBeVisible();
}

async function openSecurity(page: Page): Promise<void> {
  await page.getByRole('link', { name: COPY.session.securityLink }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: security.title }),
  ).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: COPY.session.signOut }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: COPY.login.title }),
  ).toBeVisible();
}

/** Click the page corner, which is the dialog overlay while a dialog is open. */
async function clickBackdrop(page: Page): Promise<void> {
  await page.mouse.click(2, 2);
}

async function confirm(
  dialog: Locator,
  codeLabel: string,
  code: string,
  submit: string,
): Promise<void> {
  await dialog.getByLabel(label(codeLabel)).fill(code);
  await dialog
    .getByLabel(label(security.fields.currentPassword))
    .fill(e2eEnv.twoFactorPassword);
  await dialog.getByRole('button', { name: submit }).click();
}

test('an account turns on TOTP, signs in with it, switches to email codes and changes its password', async ({
  page,
  context,
}) => {
  test.setTimeout(TWO_FACTOR_TEST_TIMEOUT_MS);

  // Login 1: password only.
  await signIn(page);
  await expectSignedIn(page);
  await openSecurity(page);
  await expect(page.getByText(security.twoFactor.statusOff)).toBeVisible();

  // Set up the authenticator app from the manual key.
  await page
    .getByRole('button', { name: security.twoFactor.setUpTotp })
    .click();
  const setup = page.getByRole('dialog', { name: security.totpSetup.title });
  await expect(
    setup.getByRole('img', { name: security.totpSetup.qrLabel }),
  ).toBeVisible();
  const shownSecret =
    (await setup.getByTestId('totp-secret').textContent()) ?? '';
  const secret = shownSecret.replaceAll(' ', '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await clickBackdrop(page);
  await expect(setup).toBeVisible();
  await expect(setup.getByTestId('totp-secret')).toHaveText(shownSecret);
  const first = await freshTotpCode(secret, undefined);
  await confirm(
    setup,
    security.fields.totpCode,
    first.code,
    security.totpSetup.submit,
  );
  await expect(page.getByText(security.twoFactor.enabledTotp)).toBeVisible();
  await expect(page.getByText(security.twoFactor.statusTotp)).toBeVisible();
  await signOut(page);

  // Login 2: password, then the authenticator code in the challenge dialog.
  await signIn(page);
  const challenge = page.getByRole('dialog', {
    name: COPY.login.twoFactor.title,
  });
  await expect(challenge).toBeVisible();
  await expect(
    challenge.getByLabel(label(COPY.login.twoFactor.totpLabel)),
  ).toBeFocused();
  await clickBackdrop(page);
  await expect(challenge).toBeVisible();
  const second = await freshTotpCode(secret, first.step);
  await challenge
    .getByLabel(label(COPY.login.twoFactor.totpLabel))
    .fill(second.code);
  await challenge
    .getByRole('button', { name: COPY.login.twoFactor.submit })
    .click();
  await expectSignedIn(page);

  // Turn TOTP off (password + a fresh code).
  await openSecurity(page);
  await page.getByRole('button', { name: security.twoFactor.turnOff }).click();
  const disable = page.getByRole('dialog', { name: security.disable.title });
  await clickBackdrop(page);
  await expect(disable).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(disable).toBeHidden();
  await page.getByRole('button', { name: security.twoFactor.turnOff }).click();
  await expect(disable).toBeVisible();
  const third = await freshTotpCode(secret, second.step);
  await confirm(
    disable,
    security.fields.totpCode,
    third.code,
    security.disable.submit,
  );
  await expect(page.getByText(security.twoFactor.disabled)).toBeVisible();

  // Email codes: the warning shows, the first code arrives by email.
  const seenBeforeSetup = await mailIdsFor(context, e2eEnv.twoFactorEmail);
  await page
    .getByRole('button', { name: security.twoFactor.emailInstead })
    .click();
  const emailSetup = page.getByRole('dialog', {
    name: security.emailSetup.title,
  });
  await expect(
    emailSetup.getByText(security.twoFactor.emailWarning),
  ).toBeVisible();
  const setupCode = await waitForCode(
    context,
    e2eEnv.twoFactorEmail,
    seenBeforeSetup,
  );
  await confirm(
    emailSetup,
    security.fields.emailCode,
    setupCode,
    security.emailSetup.submit,
  );
  await expect(page.getByText(security.twoFactor.enabledEmail)).toBeVisible();
  await signOut(page);

  // Login 3: the challenge dialog mails the code by itself.
  const seenBeforeLogin = await mailIdsFor(context, e2eEnv.twoFactorEmail);
  await signIn(page);
  await expect(challenge).toBeVisible();
  await expect(
    challenge.getByText(COPY.login.twoFactor.emailWarning),
  ).toBeVisible();
  const loginCode = await waitForCode(
    context,
    e2eEnv.twoFactorEmail,
    seenBeforeLogin,
  );
  // A backdrop click keeps the dialog and does not mail another code.
  const seenAfterLogin = await mailIdsFor(context, e2eEnv.twoFactorEmail);
  await clickBackdrop(page);
  await expect(challenge).toBeVisible();
  expect(await mailIdsFor(context, e2eEnv.twoFactorEmail)).toEqual(
    seenAfterLogin,
  );
  await challenge
    .getByLabel(label(COPY.login.twoFactor.emailLabel))
    .fill(loginCode);
  await challenge
    .getByRole('button', { name: COPY.login.twoFactor.submit })
    .click();
  await expectSignedIn(page);

  // Change password: every session ends, the client lands on sign-in.
  await openSecurity(page);
  await page
    .getByLabel(label(security.fields.currentPassword))
    .fill(e2eEnv.twoFactorPassword);
  await page
    .getByLabel(label(COPY.password.newPasswordLabel))
    .fill(NEW_PASSWORD);
  await page
    .getByLabel(label(COPY.password.confirmPasswordLabel))
    .fill(NEW_PASSWORD);
  await page
    .getByRole('button', { name: security.changePassword.submit })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: COPY.login.title }),
  ).toBeVisible();
  await expect(
    page.getByText(COPY.login.notices.passwordChanged),
  ).toBeVisible();
});
