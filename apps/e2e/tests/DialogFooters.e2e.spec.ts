import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  openRole,
  permissionCell,
  roleDiscardButton,
  roleSaveButton,
} from '../src/AccessPages.fixture';
import { ADMIN_COPY, WEB_COPY } from '../src/Apps.contract';
import { e2eEnv } from '../src/E2e.env';
import { mailIdsFor } from '../src/Mailpit.client';
import { signInAsOwner } from '../src/Session.fixture';

/**
 * Stacked footers (below sm): Cancel / Discard sits above the confirm button and comes first in Tab
 * order; from sm up it sits to the left. Covers the web sign-in dialog, its code step and the role
 * permissions action row. Nothing is saved or signed in for good.
 */
test.describe(
  'dialog footers',
  { tag: ['@cms-admin', '@web', '@cms-api', '@sign-in', '@access-admin'] },
  () => {
    test.describe.configure({ retries: 0 });

    const login = WEB_COPY.login;
    const access = ADMIN_COPY.access;
    const MOBILE = { width: 375, height: 800 };
    const DESKTOP = { width: 1280, height: 800 };

    async function box(locator: Locator) {
      const result = await locator.boundingBox();
      expect(result).not.toBeNull();
      return result as { x: number; y: number; width: number; height: number };
    }

    async function expectLayout(first: Locator, second: Locator, stacked: boolean) {
      const a = await box(first);
      const b = await box(second);
      if (stacked) expect(a.y + a.height, 'first sits above second').toBeLessThanOrEqual(b.y + 1);
      else {
        expect(a.x + a.width, 'first sits left of second').toBeLessThanOrEqual(b.x + 1);
        expect(Math.abs(a.y - b.y)).toBeLessThan(4);
      }
    }

    async function expectTabFollows(first: Locator, second: Locator, page: Page) {
      await first.focus();
      await page.keyboard.press('Tab');
      await expect(second).toBeFocused();
    }

    for (const viewport of [MOBILE, DESKTOP]) {
      const stacked = viewport.width === MOBILE.width;
      const label = `${viewport.width} px`;

      test(`web sign-in dialog footer at ${label}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(e2eEnv.webUrl);
        await page.getByRole('button', { name: WEB_COPY.session.signIn, exact: true }).click();
        const dialog = page.getByRole('dialog', { name: login.title });
        await expect(dialog).toBeVisible();
        const cancel = dialog.getByRole('button', { name: login.cancel, exact: true });
        const submit = dialog.getByRole('button', { name: login.submit, exact: true });
        await expectLayout(cancel, submit, stacked);
        await expectTabFollows(cancel, submit, page);
      });

      test(`web code step footer at ${label}`, async ({ page, context }) => {
        await page.setViewportSize(viewport);
        await page.goto(e2eEnv.webUrl);
        await page.getByRole('button', { name: WEB_COPY.session.signIn, exact: true }).click();
        const form = page.getByRole('dialog', { name: login.title });
        await expect(form.locator('input[name="cf-turnstile-response"]')).not.toHaveValue('');
        await mailIdsFor(context, e2eEnv.reader2faEmail);
        await form.getByRole('textbox', { name: login.emailLabel }).fill(e2eEnv.reader2faEmail);
        await form.getByLabel(login.passwordLabel).fill(e2eEnv.reader2faPassword);
        await form.getByRole('button', { name: login.submit, exact: true }).click();
        const step = page.getByRole('dialog', { name: login.twoFactor.title });
        await expect(step).toBeVisible();
        const cancel = step.getByRole('button', { name: login.twoFactor.cancel, exact: true });
        const submit = step.getByRole('button', { name: login.twoFactor.submit, exact: true });
        await expectLayout(cancel, submit, stacked);
        await expectTabFollows(cancel, submit, page);
      });

      test(`role permissions action row at ${label}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await signInAsOwner(page);
        await openRole(page, 'Editor');
        await permissionCell(page, access.matrix.actions.delete, access.matrix.wildcard).check();
        const discard = roleDiscardButton(page);
        const save = roleSaveButton(page);
        await expectLayout(discard, save, stacked);
        await expectTabFollows(discard, save, page);
        await discard.click();
      });
    }
  },
);
