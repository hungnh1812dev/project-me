import { expect, test } from '@playwright/test';

import { ADMIN_COPY } from '../src/Apps.contract';
import { RUN_ID } from '../src/E2e.constants';
import { labelStartingWith, toast } from '../src/Locators.fixture';
import { signInAsOwner } from '../src/Session.fixture';

const access = ADMIN_COPY.access;
const tokens = access.apiTokens;
const form = access.tokenForm;
const reveal = access.tokenReveal;

const DESKTOP = { width: 1280, height: 800 };
const SCROLL_SPACER_PX = 3000;
const SCROLLED_PX = 1200;
const FUTURE_DATE = '2999-12-31';
const TOKEN_NAME = `E2E shell ${RUN_ID}`;

test.describe('admin shell and toasts', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    const nav = page.getByRole('navigation', { name: access.nav.label });
    await nav.getByRole('link', { name: access.nav.apiTokens }).click();
    await expect(page.getByRole('heading', { level: 1, name: tokens.title })).toBeVisible();
  });

  test('the active menu item carries aria-current and the sidebar stays in view while the page scrolls', async ({
    page,
  }) => {
    const active = page.locator('aside [aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(access.nav.apiTokens);

    await page.evaluate((height) => {
      const spacer = document.createElement('div');
      spacer.style.height = `${height}px`;
      document.querySelector('main')!.appendChild(spacer);
    }, SCROLL_SPACER_PX);
    await page.locator('main').hover();
    await page.mouse.wheel(0, SCROLLED_PX);
    // From `md` up the content pane scrolls inside the viewport-high shell, not the window.
    await expect
      .poll(() => page.evaluate(() => document.querySelector('main')!.parentElement!.scrollTop))
      .toBeGreaterThan(0);

    await expect(active).toBeInViewport();
    await expect(page.locator('header').first()).toBeInViewport();
  });

  test('one save shows exactly one toast in the notification region', async ({ page }) => {
    await page.getByRole('button', { name: tokens.create }).click();
    const dialog = page.getByRole('dialog', { name: form.createTitle });
    await dialog.getByLabel(labelStartingWith(form.nameLabel)).fill(TOKEN_NAME);
    await dialog.getByLabel(labelStartingWith(form.expiresLabel)).fill(FUTURE_DATE);
    await dialog.getByRole('checkbox').first().check();
    await dialog.getByRole('button', { name: form.submitCreate }).click();
    await page
      .getByRole('dialog', { name: reveal.title(TOKEN_NAME) })
      .getByRole('button', { name: reveal.done })
      .click();

    const created = toast(page, tokens.created(TOKEN_NAME));
    await expect(created).toHaveCount(1);
    await expect(created).toBeVisible();
    await expect(page.locator('[data-slot="toast"]')).toHaveCount(1);
    await expect(
      page.getByRole('region', { name: /^Notifications/ }).locator('[data-slot="toast"]'),
    ).toHaveCount(1);
  });
});
