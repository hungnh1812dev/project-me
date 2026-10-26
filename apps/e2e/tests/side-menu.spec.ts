import { expect, test, type Page } from '@playwright/test';

import { ADMIN_COPY, API_ENDPOINTS } from '../src/app-contracts';
import { e2eEnv } from '../src/env';
import { signInAs, signInAsOwner } from '../src/session';

const nav = ADMIN_COPY.access.nav;
const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 768, height: 900 };
const PHONE = { width: 375, height: 700 };

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
