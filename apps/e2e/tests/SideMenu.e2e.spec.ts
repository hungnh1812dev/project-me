import { expect, test, type Page } from '@playwright/test';

import { ADMIN_COPY, API_ENDPOINTS, APP_ROUTES } from '../src/Apps.contract';
import { CONTENT_TYPE_NAMES } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import {
  accountMenuTrigger,
  signInAs,
  signInAsOwner,
  signInAsOwnerWithRole,
  signOutFromUserMenu,
} from '../src/Session.fixture';

const nav = ADMIN_COPY.access.nav;
const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 768, height: 900 };
const PHONE = { width: 375, height: 700 };

// Every content type of the stack: the six seeded ones plus site, sign-in, status page and CV page text.
const EXPECTED_CONTENT_TYPE_COUNT = 10;
const REVIEWER_ROLE = 'reviewer';
const EDITOR_ROLE = 'editor';

const mainMenu = (page: Page) => page.getByRole('navigation', { name: nav.label });
const menuButton = (page: Page) => page.getByRole('button', { name: nav.menu, exact: true });

test.describe('side menu', { tag: ['@cms-admin', '@cms-api'] }, () => {
  test('owner at 1280 px sees every section, an active link and no user block', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    const menu = mainMenu(page);
    for (const heading of [nav.content, nav.utilities, nav.systemSettings]) {
      await expect(menu.getByRole('heading', { name: heading })).toBeVisible();
    }
    for (const link of [nav.accounts, nav.roles, nav.apiTokens, nav.reviewer, nav.media]) {
      await expect(menu.getByRole('link', { name: link, exact: true })).toBeVisible();
    }
    await expect(menuButton(page)).toBeHidden();
    await expect(menu.getByRole('button', { name: ADMIN_COPY.session.signOut })).toHaveCount(0);
    await expect(page.getByRole('button', { name: ADMIN_COPY.session.signOut })).toHaveCount(0);
    await expect(menu.getByText(e2eEnv.ownerEmail)).toHaveCount(0);

    await menu.getByRole('link', { name: nav.media, exact: true }).click();
    await expect(menu.getByRole('link', { name: nav.media, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(menu.getByRole('link', { name: nav.accounts, exact: true })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('the content sub-groups are open by default, collapse on click and stay collapsed after a reload', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    const menu = mainMenu(page);
    const single = menu.getByRole('button', { name: nav.singleTypes, exact: true });
    const collection = menu.getByRole('button', { name: nav.collectionTypes, exact: true });
    await expect(single).toHaveAttribute('aria-expanded', 'true');
    await expect(collection).toHaveAttribute('aria-expanded', 'true');

    const singleListId = await single.getAttribute('aria-controls');
    expect(singleListId).not.toBeNull();
    const singleList = page.locator(`[id="${singleListId}"]`);
    await expect(singleList.getByRole('link').first()).toBeVisible();

    await single.click();
    await expect(single).toHaveAttribute('aria-expanded', 'false');
    await expect(singleList.getByRole('link')).toHaveCount(0);
    await expect(collection).toHaveAttribute('aria-expanded', 'true');

    await page.reload();
    await expect(single).toHaveAttribute('aria-expanded', 'false');
    await expect(collection).toHaveAttribute('aria-expanded', 'true');

    await single.click();
    await expect(single).toHaveAttribute('aria-expanded', 'true');
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
    await mainMenu(page).getByRole('link', { name: nav.media, exact: true }).click();
    await expect(mainMenu(page)).toBeHidden();
    await expect(page).toHaveURL(/\/media/);
    await expect(menuButton(page)).toBeFocused();
  });

  test('the content links carry the display names, never a slug, and open /content/<slug>', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    const menu = mainMenu(page);
    const entries = Object.entries(CONTENT_TYPE_NAMES);
    expect(entries).toHaveLength(EXPECTED_CONTENT_TYPE_COUNT);
    for (const [slug, name] of entries) {
      await expect(menu.getByRole('link', { name, exact: true })).toHaveAttribute(
        'href',
        `/content/${slug}`,
      );
      if (slug !== name.toLowerCase()) {
        await expect(menu.getByRole('link', { name: slug, exact: true })).toHaveCount(0);
      }
    }
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
    await expect(menu.getByRole('link', { name: nav.media, exact: true })).toBeVisible();
    await expect(menu.getByRole('heading', { name: nav.systemSettings })).toBeVisible();
    isBlocked = false;
    await menu.getByRole('button', { name: nav.retryCatalog }).click();
    await expect(menu.getByText(nav.catalogError)).toBeHidden();
  });

  test('a limited admin sees no unauthorised links', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword);
    const menu = mainMenu(page);
    await expect(menu.getByRole('link', { name: nav.accounts, exact: true })).toBeVisible();
    await expect(menu.getByRole('heading', { name: nav.content })).toBeVisible();
  });

  test('the owner menu names the account links "Users" and "Roles and permissions"', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    const menu = mainMenu(page);
    await expect(menu.getByRole('link', { name: 'Users', exact: true })).toHaveAttribute(
      'href',
      APP_ROUTES.ACCOUNTS,
    );
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
    await expect(menu.getByRole('heading', { name: nav.utilities })).toBeVisible();
    await expect(menu.getByRole('link', { name: nav.media, exact: true })).toBeVisible();
    await expect(menu.getByRole('heading', { name: nav.systemSettings })).toHaveCount(0);
    await expect(accountMenuTrigger(page)).toBeVisible();

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
    await expect(menu.getByRole('heading', { name: nav.content })).toBeVisible();
    await expect(menu.getByRole('link', { name: nav.media, exact: true })).toBeVisible();
    await expect(menu.getByRole('heading', { name: nav.systemSettings })).toHaveCount(0);
    for (const link of [nav.accounts, nav.roles, nav.apiTokens, nav.reviewer]) {
      await expect(menu.getByRole('link', { name: link, exact: true })).toHaveCount(0);
    }
    await expect(
      page.getByRole('status').filter({
        hasText: ADMIN_COPY.reviewer.banner.title,
      }),
    ).toHaveCount(0);
  });

  test('sign out from the user menu ends the session', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    await signOutFromUserMenu(page);
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(accountMenuTrigger(page)).toHaveCount(0);
  });
});
