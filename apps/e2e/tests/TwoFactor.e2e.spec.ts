import { expect, type Locator, type Page, test } from '@playwright/test';

import { ADMIN_COPY } from '../src/Apps.contract';
import { TWO_FACTOR_TEST_TIMEOUT_MS } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { mailIdsFor, waitForCode } from '../src/Mailpit.client';
import { freshTotpCode } from '../src/Totp.fixture';
import { expectNoViolation, watchCsp } from '../src/CspWatch.fixture';
import { labelStartingWith } from '../src/Locators.fixture';
import { expectSignedIn, submitLogin } from '../src/Session.fixture';

/**
 * Covers 2FA on the dedicated 2FA account (seeded by scripts/smoke.sh), never the
 * owner. Rate-limit budget of this spec, all from one IP within 15 min:
 * 3 logins for this email (limit 5), 4 setup/enable/disable (limit 5),
 * 2 email-code sends (limit 5), 2 verifies (limit 10), 1 password change.
 * Together with smoke + the owner specs the IP stays at 7 of 10 logins.
 * The steps depend on each other and change the account, so no retries.
 */
test.describe.configure({ mode: 'serial', retries: 0 });

const security = ADMIN_COPY.security;

/**
 * Password of the 2FA account after this spec ran (it ends with email codes on
 * and this password).
 */
const TWO_FACTOR_CHANGED_PASSWORD = `${e2eEnv.twoFactorPassword.slice(0, 100)}-changed`;

async function openSecurity(page: Page): Promise<void> {
  await page
    .getByRole('link', { name: ADMIN_COPY.session.securityLink })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: security.title }),
  ).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: ADMIN_COPY.session.signOut }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title }),
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
  await dialog.getByLabel(labelStartingWith(codeLabel)).fill(code);
  await dialog
    .getByLabel(labelStartingWith(security.fields.currentPassword))
    .fill(e2eEnv.twoFactorPassword);
  await dialog.getByRole('button', { name: submit }).click();
}

test('an account turns on TOTP, signs in with it, switches to email codes and changes its password', async ({
  page,
  context,
}) => {
  test.setTimeout(TWO_FACTOR_TEST_TIMEOUT_MS);
  const readViolations = await watchCsp(page);

  // Login 1: password only.
  await submitLogin(page, e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword);
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
  await expectNoViolation(readViolations, 'the 2FA set-up dialog');
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
  await submitLogin(page, e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword);
  const challenge = page.getByRole('dialog', {
    name: ADMIN_COPY.login.twoFactor.title,
  });
  await expect(challenge).toBeVisible();
  await expect(
    challenge.getByLabel(
      labelStartingWith(ADMIN_COPY.login.twoFactor.totpLabel),
    ),
  ).toBeFocused();
  await clickBackdrop(page);
  await expect(challenge).toBeVisible();
  const second = await freshTotpCode(secret, first.step);
  await challenge
    .getByLabel(labelStartingWith(ADMIN_COPY.login.twoFactor.totpLabel))
    .fill(second.code);
  await challenge
    .getByRole('button', { name: ADMIN_COPY.login.twoFactor.submit })
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
  await submitLogin(page, e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword);
  await expect(challenge).toBeVisible();
  await expect(
    challenge.getByText(ADMIN_COPY.login.twoFactor.emailWarning),
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
    .getByLabel(labelStartingWith(ADMIN_COPY.login.twoFactor.emailLabel))
    .fill(loginCode);
  await challenge
    .getByRole('button', { name: ADMIN_COPY.login.twoFactor.submit })
    .click();
  await expectSignedIn(page);

  // Change password: every session ends, the client lands on sign-in.
  await openSecurity(page);
  await page
    .getByLabel(labelStartingWith(security.fields.currentPassword))
    .fill(e2eEnv.twoFactorPassword);
  await page
    .getByLabel(labelStartingWith(ADMIN_COPY.password.newPasswordLabel))
    .fill(TWO_FACTOR_CHANGED_PASSWORD);
  await page
    .getByLabel(labelStartingWith(ADMIN_COPY.password.confirmPasswordLabel))
    .fill(TWO_FACTOR_CHANGED_PASSWORD);
  await page
    .getByRole('button', { name: security.changePassword.submit })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title }),
  ).toBeVisible();
  await expect(
    page.getByText(ADMIN_COPY.login.notices.passwordChanged),
  ).toBeVisible();
});
