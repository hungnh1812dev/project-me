import { expect, test, type Page } from '@playwright/test';

import { ADMIN_COPY, API_ENDPOINTS, APP_ROUTES } from '../src/Apps.contract';
import { e2eEnv } from '../src/E2e.env';
import {
  signInAs,
  signInAsOwner,
  signInAsOwnerWithRole,
} from '../src/Session.fixture';

const nav = ADMIN_COPY.access.nav;
const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 768, height: 900 };
const PHONE = { width: 375, height: 700 };

const REVIEWER_ROLE = 'reviewer';
const EDITOR_ROLE = 'editor';

const mainMenu = (page: Page) =>
  page.getByRole('navigation', { name: nav.label });
const menuButton = (page: Page) =>
  page.getByRole('button', { name: nav.menu, exact: true });

test.describe('side menu', () => {
  test('owner at 1280 px sees every section, an active link and the user block', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    const menu = mainMenu(page);
    for (const heading of [nav.content, nav.utilities, nav.systemSettings]) {
      await expect(menu.getByRole('heading', { name: heading })).toBeVisible();
    }
    for (const link of [
      nav.accounts,
      nav.roles,
      nav.apiTokens,
      nav.reviewer,
      nav.media,
    ]) {
      await expect(
        menu.getByRole('link', { name: link, exact: true }),
      ).toBeVisible();
    }
    await expect(menuButton(page)).toBeHidden();

    await menu.getByRole('link', { name: nav.media, exact: true }).click();
    await expect(
      menu.getByRole('link', { name: nav.media, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      menu.getByRole('link', { name: nav.accounts, exact: true }),
    ).not.toHaveAttribute('aria-current', 'page');
  });

  test('768 px still shows the side menu; 375 px shows the sheet with Esc, Close and link', async ({
    page,
  }) => {
    await page.setViewportSize(TABLET);
    await signInAsOwner(page);
    await expect(mainMenu(page)).toBeVisible();
    await expect(menuButton(page)).toBeHidden();

    await page.setViewportSize(PHONE);
    await expect(menuButton(page)).toBeVisible();
    await expect(mainMenu(page)).toBeHidden();

    await menuButton(page).click();
    await expect(mainMenu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(mainMenu(page)).toBeHidden();
    await expect(menuButton(page)).toBeFocused();

    await menuButton(page).click();
    await page.getByRole('button', { name: nav.closeMenu }).click();
    await expect(mainMenu(page)).toBeHidden();
    await expect(menuButton(page)).toBeFocused();

    await menuButton(page).click();
    await mainMenu(page)
      .getByRole('link', { name: nav.media, exact: true })
      .click();
    await expect(mainMenu(page)).toBeHidden();
    await expect(page).toHaveURL(/\/media/);
    await expect(menuButton(page)).toBeFocused();
  });

  test('a failing content-type catalog shows the error row and a retry restores it', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    let isBlocked = true;
    await page.route(`**${API_ENDPOINTS.CONTENT_TYPES.LIST}`, (route) =>
      isBlocked ? route.abort() : route.continue(),
    );
    await signInAsOwner(page);
    const menu = mainMenu(page);
    await expect(menu.getByText(nav.catalogError)).toBeVisible();
    await expect(
      menu.getByRole('link', { name: nav.media, exact: true }),
    ).toBeVisible();
    await expect(
      menu.getByRole('heading', { name: nav.systemSettings }),
    ).toBeVisible();
    isBlocked = false;
    await menu.getByRole('button', { name: nav.retryCatalog }).click();
    await expect(menu.getByText(nav.catalogError)).toBeHidden();
  });

  test('a limited admin sees no unauthorised links', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword);
    const menu = mainMenu(page);
    await expect(
      menu.getByRole('link', { name: nav.accounts, exact: true }),
    ).toBeVisible();
    await expect(
      menu.getByRole('heading', { name: nav.content }),
    ).toBeVisible();
  });

  test('the owner menu names the account links "Users" and "Roles and permissions"', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    const menu = mainMenu(page);
    await expect(
      menu.getByRole('link', { name: 'Users', exact: true }),
    ).toHaveAttribute('href', APP_ROUTES.ACCOUNTS);
    await expect(
      menu.getByRole('link', { name: 'Roles and permissions', exact: true }),
    ).toHaveAttribute('href', APP_ROUTES.ROLES);
  });

  test('a reviewer sees the banner above the content, no Security link and no System settings', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwnerWithRole(page, REVIEWER_ROLE);
    const menu = mainMenu(page);
    await expect(
      menu.getByRole('heading', { name: nav.utilities }),
    ).toBeVisible();
    await expect(
      menu.getByRole('link', { name: nav.media, exact: true }),
    ).toBeVisible();
    await expect(
      menu.getByRole('heading', { name: nav.systemSettings }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: ADMIN_COPY.session.securityLink }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
    ).toBeVisible();

    const banner = page.getByRole('status').filter({
      hasText: ADMIN_COPY.reviewer.banner.title,
    });
    await expect(banner).toBeVisible();
    const bannerBox = await banner.boundingBox();
    const mainBox = await page.getByRole('main').boundingBox();
    expect(bannerBox).not.toBeNull();
    expect(mainBox).not.toBeNull();
    expect(bannerBox!.y + bannerBox!.height).toBeLessThanOrEqual(mainBox!.y);
  });

  test('a role without system rights sees no System settings heading, but keeps Security', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwnerWithRole(page, EDITOR_ROLE);
    const menu = mainMenu(page);
    await expect(
      menu.getByRole('heading', { name: nav.content }),
    ).toBeVisible();
    await expect(
      menu.getByRole('link', { name: nav.media, exact: true }),
    ).toBeVisible();
    await expect(
      menu.getByRole('heading', { name: nav.systemSettings }),
    ).toHaveCount(0);
    for (const link of [nav.accounts, nav.roles, nav.apiTokens, nav.reviewer]) {
      await expect(
        menu.getByRole('link', { name: link, exact: true }),
      ).toHaveCount(0);
    }
    await expect(
      page.getByRole('link', { name: ADMIN_COPY.session.securityLink }),
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({
        hasText: ADMIN_COPY.reviewer.banner.title,
      }),
    ).toHaveCount(0);
  });

  test('sign out from the menu ends the session', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    await page
      .getByRole('button', { name: ADMIN_COPY.session.signOut })
      .click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
    ).toHaveCount(0);
  });
});
