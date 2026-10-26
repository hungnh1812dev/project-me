import { expect, test } from '@playwright/test';

import {
  accountRow,
  openRole,
  roleSaveButton,
} from '../src/AccessPages.fixture';
import { ADMIN_COPY } from '../src/AppContracts.contract';
import { CV_PAGE_SLUG } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { labelStartingWith } from '../src/Locators.fixture';
import { submitLogin } from '../src/Session.fixture';

const access = ADMIN_COPY.access;
const accounts = access.accounts;
const invite = access.invite;

test.describe('admin: limited by its own permissions and rank', () => {
  test('an admin sees its own role read-only and cannot invite an admin', async ({
    page,
  }) => {
    await submitLogin(page, e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword);
    await expect(
      page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
    ).toBeVisible();
    const nav = page.getByRole('navigation', { name: access.nav.label });
    await expect(
      nav.getByRole('link', { name: access.nav.accounts }),
    ).toBeVisible();

    // Rank: no Disable on the owner or on the other admin rows.
    await page.goto('/accounts');
    await expect(
      accountRow(page, e2eEnv.ownerEmail).getByRole('button', {
        name: accounts.disable,
      }),
    ).toHaveCount(0);
    await expect(
      accountRow(page, e2eEnv.twoFactorEmail).getByRole('button', {
        name: accounts.disable,
      }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: accounts.invite }).click();
    const options = await page
      .getByRole('dialog', { name: invite.title })
      .getByLabel(labelStartingWith(invite.roleLabel))
      .locator('option')
      .allTextContents();
    expect(options).toContain('Editor');
    for (const forbidden of ['Owner', 'Admin', 'Public', 'Reviewer']) {
      expect(options).not.toContain(forbidden);
    }
    await page.keyboard.press('Escape');

    // Own role: view only.
    await openRole(page, 'Admin');
    await expect(page.getByText(access.role.readOnly)).toBeVisible();
    await expect(roleSaveButton(page)).toHaveCount(0);
    for (const box of await page.getByRole('checkbox').all()) {
      await expect(box).toBeDisabled();
    }

    // The field picker of a view-only role ignores changes too.
    await page
      .getByRole('button', {
        name: access.matrix.detailsLabel(CV_PAGE_SLUG),
      })
      .click();
    for (const radio of await page.getByRole('radio').all()) {
      await expect(radio).toBeDisabled();
    }
  });
});
