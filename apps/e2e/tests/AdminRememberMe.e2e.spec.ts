import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { API_PATHS } from '../src/Api.endpoints';
import { ADMIN_COPY } from '../src/Apps.contract';
import { REFRESH_COOKIE_NAME } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { expectSignedIn } from '../src/Session.fixture';

const REMEMBERED_SECONDS = 2_592_000;
const SESSION_COOKIE_EXPIRES = -1;

const rememberBox = (page: Page) =>
  page.getByRole('checkbox', { name: ADMIN_COPY.login.rememberMe });

async function fillCredentials(page: Page, password = e2eEnv.ownerPassword) {
  await page.getByRole('textbox', { name: ADMIN_COPY.login.emailLabel }).fill(e2eEnv.ownerEmail);
  await page.getByLabel(ADMIN_COPY.login.passwordLabel).fill(password);
}

async function refreshCookie(context: BrowserContext) {
  const cookies = await context.cookies(`${e2eEnv.apiBaseUrl}${API_PATHS.AUTH.REFRESH}`);
  return cookies.find((cookie) => cookie.name === REFRESH_COOKIE_NAME);
}

test('the box is unticked again after a failed sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(rememberBox(page)).not.toBeChecked();

  await fillCredentials(page, `${e2eEnv.ownerPassword}-wrong`);
  await rememberBox(page).check();
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(rememberBox(page)).not.toBeChecked();
});

test('the tab order is email, password, box, submit and Space toggles the box', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('textbox', { name: ADMIN_COPY.login.emailLabel }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel(ADMIN_COPY.login.passwordLabel)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(rememberBox(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(rememberBox(page)).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: ADMIN_COPY.login.submit })).toBeFocused();
});

test('an unticked sign-in sets a session cookie and survives a reload', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await fillCredentials(page);
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
  await expectSignedIn(page);

  expect(await refreshCookie(context)).toMatchObject({ expires: SESSION_COOKIE_EXPIRES });

  await page.reload();
  await expectSignedIn(page);
});

test('a ticked sign-in sets a 30-day cookie and survives a reload', async ({ page, context }) => {
  await page.goto('/');
  await fillCredentials(page);
  await rememberBox(page).check();
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
  await expectSignedIn(page);

  const cookie = await refreshCookie(context);
  const secondsLeft = (cookie?.expires ?? 0) - Date.now() / 1000;
  expect(secondsLeft).toBeGreaterThan(REMEMBERED_SECONDS - 120);
  expect(secondsLeft).toBeLessThanOrEqual(REMEMBERED_SECONDS);

  await page.reload();
  await expectSignedIn(page);
});

test('the box is unticked again after a two-factor cancel', async ({ page }) => {
  // A stubbed challenge: a real email-code account would spend its hourly
  // quota of code mails, which other specs need.
  await page.route(`**${API_PATHS.AUTH.LOGIN}`, (route) =>
    route.fulfill({ json: { requires2FA: true, tempToken: 'stub', methods: ['totp'] } }),
  );
  await page.goto('/');
  await fillCredentials(page);
  await rememberBox(page).check();
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();

  await expect(page.getByRole('dialog', { name: ADMIN_COPY.login.twoFactor.title })).toBeVisible();
  await page.getByRole('button', { name: ADMIN_COPY.login.twoFactor.cancel }).click();

  await expect(rememberBox(page)).toBeVisible();
  await expect(rememberBox(page)).not.toBeChecked();
});

test('an unticked session is restored in a second tab of the same browser', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await fillCredentials(page);
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
  await expectSignedIn(page);

  const secondTab = await context.newPage();
  await secondTab.goto('/');
  await expectSignedIn(secondTab);

  await page.reload();
  await expectSignedIn(page);
});
