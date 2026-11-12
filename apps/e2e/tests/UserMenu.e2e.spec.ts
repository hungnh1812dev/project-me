import { expect, test, type Page } from '@playwright/test';

import { ADMIN_COPY, APP_ROUTES } from '../src/Apps.contract';
import { e2eEnv } from '../src/E2e.env';
import {
  accountMenuTrigger,
  openUserMenu,
  signInAsOwner,
  signInAsOwnerWithRole,
  signOutFromUserMenu,
} from '../src/Session.fixture';

const session = ADMIN_COPY.session;
const security = ADMIN_COPY.security;
const nav = ADMIN_COPY.access.nav;

const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 768, height: 900 };
const PHONE = { width: 375, height: 700 };

const OWNER_ROLE = 'owner';
const REVIEWER_ROLE = 'reviewer';
const EDITOR_ROLE = 'editor';
const WRONG_CURRENT_PASSWORD = 'not-the-current-password-1';
const NEW_PASSWORD = 'a-brand-new-passphrase-1';

const menuItem = (page: Page, name: string) =>
  page.getByRole('menu').getByRole('menuitem', { name, exact: true });

const profileHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: security.profile.title });

/** Account menu trigger name is "Account menu for <name>"; the display name is the rest. */
async function displayNameOf(page: Page): Promise<string> {
  const label = await accountMenuTrigger(page).getAttribute('aria-label');
  return (label ?? '').replace(session.accountMenu(''), '');
}

test.describe('settings routes', { tag: ['@cms-admin', '@cms-api'] }, () => {
  test('profile shows name, email and role as text, with no input', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    await page.goto(APP_ROUTES.PROFILE);
    await expect(profileHeading(page)).toBeVisible();
    const main = page.getByRole('main');
    for (const label of [security.profile.name, security.profile.email, security.profile.role]) {
      await expect(main.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(main.locator('dd')).toHaveText([
      await displayNameOf(page),
      e2eEnv.ownerEmail,
      OWNER_ROLE,
    ]);
    await expect(main.locator('input, textarea, select')).toHaveCount(0);
  });

  test('change password shows the form and a wrong current password is rejected', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    await page.goto(APP_ROUTES.CHANGE_PASSWORD);
    await expect(
      page.getByRole('heading', { level: 1, name: security.changePassword.pageTitle }),
    ).toBeVisible();
    await page.getByLabel(security.fields.currentPassword).fill(WRONG_CURRENT_PASSWORD);
    await page.locator('input[name="newPassword"]').fill(NEW_PASSWORD);
    await page.locator('input[name="confirmPassword"]').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: security.changePassword.submit }).click();
    await expect(page.getByText(security.errors.wrongPassword)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.CHANGE_PASSWORD}$`));
  });

  test('security settings shows two-factor and no password form', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    await page.goto(APP_ROUTES.SECURITY_SETTINGS);
    await expect(page.getByRole('heading', { level: 1, name: security.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: security.changePassword.title })).toHaveCount(0);
    await expect(page.getByLabel(security.fields.currentPassword)).toHaveCount(0);
  });

  for (const route of [
    APP_ROUTES.PROFILE,
    APP_ROUTES.CHANGE_PASSWORD,
    APP_ROUTES.SECURITY_SETTINGS,
  ]) {
    test(`signed out, ${route} redirects to sign-in`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
      await expect(
        page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title }),
      ).toBeVisible();
    });
  }
});

test.describe('top bar user menu', { tag: ['@cms-admin', '@cms-api'] }, () => {
  test('owner at 1280 px: initials, details, items, routes', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    const trigger = accountMenuTrigger(page);
    const name = await displayNameOf(page);
    expect(name.length).toBeGreaterThan(0);
    await expect(trigger).toHaveAccessibleName(session.accountMenu(name));
    const initials = (await trigger.innerText()).trim();
    expect(initials.length).toBeGreaterThan(0);
    expect(initials).toBe(initials.toUpperCase());

    const menu = await openUserMenu(page);
    await expect(menu.getByText(name, { exact: true }).first()).toBeVisible();
    await expect(menu.getByText(e2eEnv.ownerEmail, { exact: true })).toBeVisible();
    await expect(menu.getByText(OWNER_ROLE, { exact: true }).last()).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText([
      session.profileLink,
      session.changePasswordLink,
      session.securityLink,
      session.signOut,
    ]);

    const targets = [
      { item: session.profileLink, route: APP_ROUTES.PROFILE },
      { item: session.changePasswordLink, route: APP_ROUTES.CHANGE_PASSWORD },
      { item: session.securityLink, route: APP_ROUTES.SECURITY_SETTINGS },
    ];
    for (const { item, route } of targets) {
      await menuItem(page, item).click();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole('menu')).toHaveCount(0);
      if (route !== APP_ROUTES.SECURITY_SETTINGS) await openUserMenu(page);
    }
  });

  test('keyboard only: open, pick an item, Escape closes and returns focus', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    const trigger = accountMenuTrigger(page);
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/settings\//);
    await expect(page.getByRole('menu')).toHaveCount(0);

    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('Sign out ends the session and closes the menu', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    await signOutFromUserMenu(page);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.goto(APP_ROUTES.PROFILE);
    await expect(page).toHaveURL(/\/login/);
  });

  test('a reviewer sees Profile and Sign out only, with the banner below the top bar', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwnerWithRole(page, REVIEWER_ROLE);
    const menu = await openUserMenu(page);
    await expect(menu.getByText(e2eEnv.ownerEmail, { exact: true })).toBeVisible();
    await expect(menu.getByText(REVIEWER_ROLE, { exact: true }).last()).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText([session.profileLink, session.signOut]);
    await page.keyboard.press('Escape');

    const banner = page.getByRole('status').filter({ hasText: ADMIN_COPY.reviewer.banner.title });
    await expect(banner).toBeVisible();
    const topBarBox = await page.getByRole('banner').boundingBox();
    const bannerBox = await banner.boundingBox();
    const mainBox = await page.getByRole('main').boundingBox();
    expect(topBarBox).not.toBeNull();
    expect(bannerBox).not.toBeNull();
    expect(mainBox).not.toBeNull();
    expect(bannerBox!.y).toBeGreaterThanOrEqual(topBarBox!.y + topBarBox!.height);
    expect(bannerBox!.y + bannerBox!.height).toBeLessThanOrEqual(mainBox!.y);

    await openUserMenu(page);
    await menuItem(page, session.signOut).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('an editor sees all four items', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwnerWithRole(page, EDITOR_ROLE);
    const menu = await openUserMenu(page);
    await expect(menu.getByRole('menuitem')).toHaveText([
      session.profileLink,
      session.changePasswordLink,
      session.securityLink,
      session.signOut,
    ]);
  });
});

test.describe('shell at mobile width', { tag: ['@cms-admin', '@cms-api'] }, () => {
  test('375 px: top bar, user menu inside the viewport, avatar usable after the sheet', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await signInAsOwner(page);
    const topBar = page.getByRole('banner');
    const sheetTrigger = page.getByRole('button', { name: nav.menu, exact: true });
    await expect(topBar.getByRole('link', { name: ADMIN_COPY.app.name })).toBeVisible();
    await expect(sheetTrigger).toBeVisible();
    await expect(accountMenuTrigger(page)).toBeVisible();

    await sheetTrigger.click();
    await page.keyboard.press('Escape');
    await expect(accountMenuTrigger(page)).toBeVisible();
    await sheetTrigger.click();
    await page.getByRole('button', { name: nav.closeMenu }).click();
    await expect(accountMenuTrigger(page)).toBeVisible();

    const menu = await openUserMenu(page);
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(PHONE.width);

    await menuItem(page, session.profileLink).click();
    await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.PROFILE}$`));
    await expect(profileHeading(page)).toBeVisible();

    await signOutFromUserMenu(page);
  });

  test('768 px: side menu shown and no menu-sheet trigger', async ({ page }) => {
    await page.setViewportSize(TABLET);
    await signInAsOwner(page);
    await expect(page.getByRole('navigation', { name: nav.label })).toBeVisible();
    await expect(page.getByRole('button', { name: nav.menu, exact: true })).toBeHidden();
    await expect(accountMenuTrigger(page)).toBeVisible();
  });
});
