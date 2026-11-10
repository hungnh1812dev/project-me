import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';

import { ADMIN_COPY, APP_ROUTES } from '../src/Apps.contract';
import { expectNoViolation, watchCsp } from '../src/CspWatch.fixture';
import { SLOW_STATE_TIMEOUT_MS, TWO_FACTOR_TEST_TIMEOUT_MS } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { labelStartingWith, toast } from '../src/Locators.fixture';
import { mailIdsFor, waitForCode } from '../src/Mailpit.client';
import {
  accountMenuTrigger,
  chooseUserMenuItem,
  expectSignedIn,
  signOutFromUserMenu,
  submitLogin,
} from '../src/Session.fixture';
import { freshTotpCode } from '../src/Totp.fixture';

/**
 * Covers 2FA on the dedicated 2FA account (seeded by scripts/smoke.sh), never the
 * owner. Rate-limit budget of this spec, all from one IP within 15 min:
 * 3 logins for this email (limit 5), 4 setup/enable/disable, 2 email-code sends,
 * 2 verifies (limit 10), 1 password change. Together with smoke + the owner specs
 * the IP stays at 7 of 10 logins.
 * The restore hook after the steps adds 1 login (4 of 5 for this email), 1 email-code
 * send and its verify, 1 disable and 1 password change; the IP reaches 8 of 10.
 * Setup/enable/disable would be 5 of 5 in production, but the restore needs a 6th
 * call once other specs share the window, so test stacks raise that limit
 * (TWO_FACTOR_MANAGE_RATE_LIMIT_IP, like the email-code one) and the restore never
 * depends on the budget.
 * The steps depend on each other and change the account, so no retries.
 */
test.describe.configure({ mode: 'serial', retries: 0 });

const security = ADMIN_COPY.security;

/**
 * Password of the 2FA account after this spec ran (it ends with email codes on
 * and this password).
 */
const TWO_FACTOR_CHANGED_PASSWORD = `${e2eEnv.twoFactorPassword.slice(0, 100)}-changed`;

/**
 * What the steps changed on the stored account, so the after hook puts it back to
 * its seeded state (stored password, two-factor sign-in off). Set before the action
 * that may complete the change, so a failure right after it is still restored.
 */
const changes = {
  password: e2eEnv.twoFactorPassword,
  isTwoFactorTouched: false,
  totpSecret: undefined as string | undefined,
  lastTotpStep: undefined as number | undefined,
};

async function openSecurity(page: Page): Promise<void> {
  await chooseUserMenuItem(page, ADMIN_COPY.session.securityLink);
  await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.SECURITY_SETTINGS}$`));
  await expect(page.getByRole('heading', { level: 1, name: security.title })).toBeVisible();
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
  password: string = e2eEnv.twoFactorPassword,
): Promise<void> {
  await dialog.getByLabel(labelStartingWith(codeLabel)).fill(code);
  await dialog.getByLabel(labelStartingWith(security.fields.currentPassword)).fill(password);
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
  await page.getByRole('button', { name: security.twoFactor.setUpTotp }).click();
  const setup = page.getByRole('dialog', { name: security.totpSetup.title });
  await expect(setup.getByRole('img', { name: security.totpSetup.qrLabel })).toBeVisible();
  await expectNoViolation(readViolations, 'the 2FA set-up dialog');
  const shownSecret = (await setup.getByTestId('totp-secret').textContent()) ?? '';
  const secret = shownSecret.replaceAll(' ', '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  changes.totpSecret = secret;
  changes.isTwoFactorTouched = true;
  await clickBackdrop(page);
  await expect(setup).toBeVisible();
  await expect(setup.getByTestId('totp-secret')).toHaveText(shownSecret);
  const first = await freshTotpCode(secret, undefined);
  changes.lastTotpStep = first.step;
  await confirm(setup, security.fields.totpCode, first.code, security.totpSetup.submit);
  await expect(toast(page, security.twoFactor.enabledTotp)).toBeVisible({
    timeout: SLOW_STATE_TIMEOUT_MS,
  });
  await expect(page.getByText(security.twoFactor.statusTotp)).toBeVisible({
    timeout: SLOW_STATE_TIMEOUT_MS,
  });
  await signOutFromUserMenu(page);

  // Login 2: password, then the authenticator code in the challenge dialog.
  await submitLogin(page, e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword);
  const challenge = page.getByRole('dialog', {
    name: ADMIN_COPY.login.twoFactor.title,
  });
  await expect(challenge).toBeVisible();
  await expect(
    challenge.getByLabel(labelStartingWith(ADMIN_COPY.login.twoFactor.totpLabel)),
  ).toBeFocused();
  await clickBackdrop(page);
  await expect(challenge).toBeVisible();
  const second = await freshTotpCode(secret, first.step);
  changes.lastTotpStep = second.step;
  await challenge
    .getByLabel(labelStartingWith(ADMIN_COPY.login.twoFactor.totpLabel))
    .fill(second.code);
  await challenge.getByRole('button', { name: ADMIN_COPY.login.twoFactor.submit }).click();
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
  changes.lastTotpStep = third.step;
  await expect(disable).toBeVisible();
  await expect(disable.getByLabel(labelStartingWith(security.fields.totpCode))).toBeVisible();
  await confirm(disable, security.fields.totpCode, third.code, security.disable.submit);
  await expect(toast(page, security.twoFactor.disabled)).toBeVisible();

  // Email codes: the warning shows, the first code arrives by email.
  changes.isTwoFactorTouched = true;
  const seenBeforeSetup = await mailIdsFor(context, e2eEnv.twoFactorEmail);
  await page.getByRole('button', { name: security.twoFactor.emailInstead }).click();
  const emailSetup = page.getByRole('dialog', {
    name: security.emailSetup.title,
  });
  await expect(emailSetup.getByText(security.twoFactor.emailWarning)).toBeVisible();
  const setupCode = await waitForCode(context, e2eEnv.twoFactorEmail, seenBeforeSetup);
  await confirm(emailSetup, security.fields.emailCode, setupCode, security.emailSetup.submit);
  await expect(page.getByText(security.twoFactor.enabledEmail)).toBeVisible();
  await signOutFromUserMenu(page);

  // Login 3: the challenge dialog mails the code by itself.
  const seenBeforeLogin = await mailIdsFor(context, e2eEnv.twoFactorEmail);
  await submitLogin(page, e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword);
  await expect(challenge).toBeVisible();
  await expect(challenge.getByText(ADMIN_COPY.login.twoFactor.emailWarning)).toBeVisible();
  const loginCode = await waitForCode(context, e2eEnv.twoFactorEmail, seenBeforeLogin);
  // A backdrop click keeps the dialog and does not mail another code.
  const seenAfterLogin = await mailIdsFor(context, e2eEnv.twoFactorEmail);
  await clickBackdrop(page);
  await expect(challenge).toBeVisible();
  expect(await mailIdsFor(context, e2eEnv.twoFactorEmail)).toEqual(seenAfterLogin);
  await challenge
    .getByLabel(labelStartingWith(ADMIN_COPY.login.twoFactor.emailLabel))
    .fill(loginCode);
  await challenge.getByRole('button', { name: ADMIN_COPY.login.twoFactor.submit }).click();
  await expectSignedIn(page);

  // Change password: every session ends, the client lands on sign-in.
  await chooseUserMenuItem(page, ADMIN_COPY.session.changePasswordLink);
  await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.CHANGE_PASSWORD}$`));
  await page
    .getByLabel(labelStartingWith(security.fields.currentPassword))
    .fill(e2eEnv.twoFactorPassword);
  await page
    .getByLabel(labelStartingWith(ADMIN_COPY.password.newPasswordLabel))
    .fill(TWO_FACTOR_CHANGED_PASSWORD);
  await page
    .getByLabel(labelStartingWith(ADMIN_COPY.password.confirmPasswordLabel))
    .fill(TWO_FACTOR_CHANGED_PASSWORD);
  changes.password = TWO_FACTOR_CHANGED_PASSWORD;
  await page.getByRole('button', { name: security.changePassword.submit }).click();
  await expect(page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title })).toBeVisible();
  await expect(page.getByText(ADMIN_COPY.login.notices.passwordChanged)).toBeVisible();
});

/** Fills the sign-in challenge, whichever method the account holds right now. */
async function answerChallenge(
  challenge: Locator,
  context: BrowserContext,
  seenMailIds: ReadonlySet<string>,
): Promise<void> {
  const totpField = challenge.getByLabel(labelStartingWith(ADMIN_COPY.login.twoFactor.totpLabel));
  if (await totpField.isVisible()) {
    if (changes.totpSecret === undefined) throw new Error('2FA restore: no TOTP secret was seen');
    const next = await freshTotpCode(changes.totpSecret, changes.lastTotpStep);
    changes.lastTotpStep = next.step;
    await totpField.fill(next.code);
  } else {
    const code = await waitForCode(context, e2eEnv.twoFactorEmail, seenMailIds);
    await challenge.getByLabel(labelStartingWith(ADMIN_COPY.login.twoFactor.emailLabel)).fill(code);
  }
  await challenge.getByRole('button', { name: ADMIN_COPY.login.twoFactor.submit }).click();
  await expectSignedIn(challenge.page());
}

async function turnTwoFactorOff(page: Page, context: BrowserContext): Promise<void> {
  await openSecurity(page);
  const turnOff = page.getByRole('button', { name: security.twoFactor.turnOff });
  await turnOff.or(page.getByRole('button', { name: security.twoFactor.setUpTotp })).waitFor();
  if (!(await turnOff.isVisible())) return;
  const seenMailIds = await mailIdsFor(context, e2eEnv.twoFactorEmail);
  await turnOff.click();
  const disable = page.getByRole('dialog', { name: security.disable.title });
  const totpField = disable.getByLabel(labelStartingWith(security.fields.totpCode));
  await expect(disable).toBeVisible();
  if (await totpField.isVisible()) {
    if (changes.totpSecret === undefined) throw new Error('2FA restore: no TOTP secret was seen');
    const next = await freshTotpCode(changes.totpSecret, changes.lastTotpStep);
    await confirm(
      disable,
      security.fields.totpCode,
      next.code,
      security.disable.submit,
      changes.password,
    );
  } else {
    const code = await waitForCode(context, e2eEnv.twoFactorEmail, seenMailIds);
    await confirm(
      disable,
      security.fields.emailCode,
      code,
      security.disable.submit,
      changes.password,
    );
  }
  await expect(page.getByText(security.twoFactor.disabled)).toBeVisible();
}

async function restoreStoredPassword(page: Page): Promise<void> {
  await chooseUserMenuItem(page, ADMIN_COPY.session.changePasswordLink);
  await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.CHANGE_PASSWORD}$`));
  await page.getByLabel(labelStartingWith(security.fields.currentPassword)).fill(changes.password);
  await page
    .getByLabel(labelStartingWith(ADMIN_COPY.password.newPasswordLabel))
    .fill(e2eEnv.twoFactorPassword);
  await page
    .getByLabel(labelStartingWith(ADMIN_COPY.password.confirmPasswordLabel))
    .fill(e2eEnv.twoFactorPassword);
  await page.getByRole('button', { name: security.changePassword.submit }).click();
  await expect(page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title })).toBeVisible();
  changes.password = e2eEnv.twoFactorPassword;
}

/**
 * Puts the stored 2FA account back as the stack seeded it (ADR 0020 decision 6), so
 * the logins kept in `.localEnv.agent` stay valid on a kept stack. Runs after a
 * failed step too and skips what the steps did not change.
 */
async function restoreSeededAccount(browser: Browser): Promise<void> {
  const isPasswordChanged = changes.password !== e2eEnv.twoFactorPassword;
  if (!isPasswordChanged && !changes.isTwoFactorTouched) return;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const seenMailIds = await mailIdsFor(context, e2eEnv.twoFactorEmail);
    await submitLogin(page, e2eEnv.twoFactorEmail, changes.password);
    const challenge = page.getByRole('dialog', { name: ADMIN_COPY.login.twoFactor.title });
    await challenge.or(accountMenuTrigger(page)).waitFor();
    if (await challenge.isVisible()) await answerChallenge(challenge, context, seenMailIds);
    await expectSignedIn(page);
    if (changes.isTwoFactorTouched) await turnTwoFactorOff(page, context);
    if (isPasswordChanged) await restoreStoredPassword(page);
  } finally {
    await context.close();
  }
}

test.afterAll(async ({ browser }) => {
  test.setTimeout(TWO_FACTOR_TEST_TIMEOUT_MS);
  await restoreSeededAccount(browser);
});
