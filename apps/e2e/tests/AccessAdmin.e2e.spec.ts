import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import { ADMIN_COPY } from '../src/AppContracts.contract';
import { e2eEnv } from '../src/E2e.env';
import { mailIdsFor, waitForCode } from '../src/Mailpit.client';
import { labelStartingWith } from '../src/Locators.fixture';
import { RUN_ID, CV_PAGE_SLUG } from '../src/E2e.constants';
import { submitLogin } from '../src/Session.fixture';
import {
  accountRow,
  openRole,
  permissionCell,
  roleDiscardButton,
  roleSaveButton,
} from '../src/AccessPages.fixture';

const access = ADMIN_COPY.access;
const accounts = access.accounts;
const invite = access.invite;

/** Unique per run so a kept stack can be tested again. */
const INVITEE_EMAIL = `e2e-invitee-${RUN_ID}@domain.localhost`;
const INVITEE_NAME = `Invitee ${RUN_ID}`;
const INVITEE_PASSWORD = `${e2eEnv.ownerPassword.slice(0, 40)}-invitee`;
const OLD_BROWSER_ROLE = 'Editor';
const INVALID_JSON = '{"all": [';
/** Valid JSON that the server's conditions DSL refuses (unknown operator). */
const SERVER_REJECTED_CONDITIONS =
  '{"all":[{"field":"createdBy","op":"nope"}]}';

test.describe.serial('owner: accounts and roles', () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    // One owner login for the whole describe: the owner has 5 logins per
    // 15 minutes (smoke + other specs already use 4).
    context = await browser.newContext();
    page = await context.newPage();
    await submitLogin(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
    await expect(
      page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
    ).toBeVisible();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('the accounts table shows the signed-in owner and the actions', async () => {
    await page.goto('/accounts');
    await expect(
      page.getByRole('heading', { level: 1, name: accounts.title }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: accounts.invite }),
    ).toBeVisible();
    for (const column of [
      accounts.columns.name,
      accounts.columns.role,
      accounts.columns.status,
      accounts.columns.twoFactor,
      accounts.columns.created,
    ]) {
      await expect(
        page.getByRole('columnheader', { name: column }),
      ).toBeVisible();
    }
    const ownRow = accountRow(page, e2eEnv.ownerEmail);
    await expect(ownRow).toContainText(accounts.you);
    await expect(ownRow).toContainText(accounts.status.active);
    // No Disable on the owner's own row; other rows have it.
    await expect(
      ownRow.getByRole('button', { name: accounts.disable }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: accounts.disable }).first(),
    ).toBeVisible();
  });

  test('the invite dialog validates, lists assignable roles and closes with Escape or Cancel', async () => {
    await page.goto('/accounts');
    const trigger = page.getByRole('button', { name: accounts.invite });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: invite.title });
    await expect(dialog).toBeVisible();

    // Empty submit: inline errors, no request.
    let posted = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/accounts')) {
        posted += 1;
      }
    });
    await dialog.getByRole('button', { name: invite.submit }).click();
    await expect(dialog).toContainText(invite.validation.emailRequired);
    await expect(dialog).toContainText(invite.validation.displayNameRequired);
    await expect(dialog).toContainText(invite.validation.roleRequired);
    expect(posted).toBe(0);

    // The owner may invite below its own rank, never owner / public / reviewer.
    const options = await dialog
      .getByLabel(labelStartingWith(invite.roleLabel))
      .locator('option')
      .allTextContents();
    expect(options).toEqual(
      expect.arrayContaining([invite.rolePlaceholder, 'Admin', 'Editor']),
    );
    for (const forbidden of ['Owner', 'Public', 'Reviewer']) {
      expect(options).not.toContain(forbidden);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('inviting an existing email shows the error under Email and keeps the input', async () => {
    await page.goto('/accounts');
    await page.getByRole('button', { name: accounts.invite }).click();
    const dialog = page.getByRole('dialog', { name: invite.title });
    await dialog
      .getByLabel(labelStartingWith(invite.emailLabel))
      .fill(e2eEnv.twoFactorEmail);
    await dialog
      .getByLabel(labelStartingWith(invite.displayNameLabel))
      .fill('Duplicate');
    await dialog
      .getByLabel(labelStartingWith(invite.roleLabel))
      .selectOption('Editor');
    await dialog.getByRole('button', { name: invite.submit }).click();
    await expect(dialog).toContainText(invite.errors.emailTaken);
    await expect(
      dialog.getByLabel(labelStartingWith(invite.emailLabel)),
    ).toHaveValue(e2eEnv.twoFactorEmail);
    await expect(
      dialog.getByLabel(labelStartingWith(invite.emailLabel)),
    ).toBeFocused();
    await page.keyboard.press('Escape');
  });

  test('an invited account gets an email code, sets a password, and cannot sign in once disabled, and can again once enabled', async ({
    browser,
  }) => {
    await page.goto('/accounts');
    const seen = await mailIdsFor(context, INVITEE_EMAIL);
    await page.getByRole('button', { name: accounts.invite }).click();
    const dialog = page.getByRole('dialog', { name: invite.title });
    await dialog
      .getByLabel(labelStartingWith(invite.emailLabel))
      .fill(INVITEE_EMAIL);
    await dialog
      .getByLabel(labelStartingWith(invite.displayNameLabel))
      .fill(INVITEE_NAME);
    await dialog
      .getByLabel(labelStartingWith(invite.roleLabel))
      .selectOption('Editor');
    // Enter submits the form.
    await dialog
      .getByLabel(labelStartingWith(invite.displayNameLabel))
      .press('Enter');

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toHaveText(
      accounts.invited(INVITEE_EMAIL),
    );
    const row = accountRow(page, INVITEE_EMAIL);
    await expect(row).toContainText(INVITEE_NAME);
    await expect(row).toContainText(accounts.status.invited);

    // The invitation email carries the code; the invitee sets a password.
    const code = await waitForCode(context, INVITEE_EMAIL, seen);
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    try {
      await inviteePage.goto('/set-password');
      await expect(
        inviteePage.getByRole('heading', {
          level: 1,
          name: ADMIN_COPY.password.set.title,
        }),
      ).toBeVisible();
      await inviteePage
        .getByLabel(labelStartingWith(ADMIN_COPY.password.emailLabel))
        .fill(INVITEE_EMAIL);
      await inviteePage
        .getByLabel(labelStartingWith(ADMIN_COPY.password.codeLabel))
        .fill(code);
      await inviteePage
        .getByLabel(labelStartingWith(ADMIN_COPY.password.newPasswordLabel))
        .fill(INVITEE_PASSWORD);
      await inviteePage
        .getByLabel(labelStartingWith(ADMIN_COPY.password.confirmPasswordLabel))
        .fill(INVITEE_PASSWORD);
      await inviteePage
        .getByRole('button', { name: ADMIN_COPY.password.set.submit })
        .click();
      await expect(inviteePage.getByRole('status')).toHaveText(
        ADMIN_COPY.login.notices.passwordSet,
      );

      // Owner disables the now-active account: confirmation names it.
      await page.reload();
      await expect(row).toContainText(accounts.status.active);
      await row
        .getByRole('button', { name: accounts.disableLabel(INVITEE_NAME) })
        .click();
      const confirm = page.getByRole('dialog', {
        name: access.disable.title(INVITEE_NAME),
      });
      await expect(confirm).toBeVisible();
      await confirm
        .getByRole('button', {
          name: access.disable.submit(INVITEE_NAME),
        })
        .click();
      await expect(confirm).toBeHidden();
      await expect(page.getByRole('status')).toHaveText(
        accounts.disabled(INVITEE_NAME),
      );
      await expect(row).toContainText(accounts.status.disabled);
      await expect(
        row.getByRole('button', { name: accounts.disable }),
      ).toHaveCount(0);

      // The disabled account cannot sign in.
      await submitLogin(inviteePage, INVITEE_EMAIL, INVITEE_PASSWORD);
      await expect(
        inviteePage.getByText(ADMIN_COPY.login.errors.invalidCredentials),
      ).toBeVisible();

      // Owner enables it again: no dialog, success notice, can sign in.
      await row
        .getByRole('button', { name: accounts.enableLabel(INVITEE_NAME) })
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('status')).toHaveText(
        accounts.enabled(INVITEE_NAME),
      );
      await expect(row).toContainText(accounts.status.active);
      await expect(
        row.getByRole('button', { name: accounts.enable }),
      ).toHaveCount(0);
      await submitLogin(inviteePage, INVITEE_EMAIL, INVITEE_PASSWORD);
      await expect(
        inviteePage.getByRole('button', { name: ADMIN_COPY.session.signOut }),
      ).toBeVisible();
    } finally {
      await inviteeContext.close();
    }
  });

  test('resending an invite mails a new code; the older code stops working', async ({
    browser,
  }) => {
    const email = `e2e-resend-${RUN_ID}@domain.localhost`;
    const name = `Resend ${RUN_ID}`;
    // Stays on /accounts from the test before: every full page load costs
    // a silent refresh, and the refresh limit is 30 per minute per IP.
    const seen = await mailIdsFor(context, email);
    await page.getByRole('button', { name: accounts.invite }).click();
    const dialog = page.getByRole('dialog', { name: invite.title });
    await dialog.getByLabel(labelStartingWith(invite.emailLabel)).fill(email);
    await dialog
      .getByLabel(labelStartingWith(invite.displayNameLabel))
      .fill(name);
    await dialog
      .getByLabel(labelStartingWith(invite.roleLabel))
      .selectOption('Editor');
    await dialog.getByRole('button', { name: invite.submit }).click();
    await expect(dialog).toBeHidden();
    const oldCode = await waitForCode(context, email, seen);

    const row = accountRow(page, email);
    await expect(row).toContainText(accounts.status.invited);
    // Enable is for disabled rows only.
    await expect(
      row.getByRole('button', { name: accounts.enable }),
    ).toHaveCount(0);
    const afterInvite = await mailIdsFor(context, email);
    await row.getByRole('button', { name: accounts.resendLabel(name) }).click();
    await expect(page.getByRole('status')).toHaveText(accounts.resent(email));
    const newCode = await waitForCode(context, email, afterInvite);

    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    // One page load only: each load of the app costs a silent refresh and
    // the refresh limit is 30 per minute per IP for the whole suite.
    await inviteePage.goto('/set-password');
    const fillForm = async (code: string) => {
      await inviteePage
        .getByLabel(labelStartingWith(ADMIN_COPY.password.emailLabel))
        .fill(email);
      await inviteePage
        .getByLabel(labelStartingWith(ADMIN_COPY.password.codeLabel))
        .fill(code);
      await inviteePage
        .getByLabel(labelStartingWith(ADMIN_COPY.password.newPasswordLabel))
        .fill(INVITEE_PASSWORD);
      await inviteePage
        .getByLabel(labelStartingWith(ADMIN_COPY.password.confirmPasswordLabel))
        .fill(INVITEE_PASSWORD);
      await inviteePage
        .getByRole('button', { name: ADMIN_COPY.password.set.submit })
        .click();
    };
    try {
      if (newCode !== oldCode) {
        await fillForm(oldCode);
        await expect(inviteePage.getByRole('alert')).toBeVisible();
      }
      await fillForm(newCode);
      await expect(inviteePage.getByRole('status')).toHaveText(
        ADMIN_COPY.login.notices.passwordSet,
      );
    } finally {
      await inviteeContext.close();
    }
  });

  test('the accounts table shows its range and disables paging on a single page', async () => {
    // Over 20 accounts would be needed to page; the smoke stack has a few.
    const nav = page.getByRole('navigation', {
      name: accounts.pagination.label,
    });
    const rows = await page
      .getByRole('row')
      .filter({ has: page.getByRole('cell') })
      .count();
    await expect(nav).toContainText(accounts.pagination.range(1, rows, rows));
    await expect(
      nav.getByRole('button', { name: accounts.pagination.previous }),
    ).toBeDisabled();
    await expect(
      nav.getByRole('button', { name: accounts.pagination.next }),
    ).toBeDisabled();
  });

  test('roles are listed by rank and the owner role has nothing to configure', async () => {
    await page.goto('/roles');
    const rankColumn = await page
      .getByRole('row')
      .filter({ has: page.getByRole('link') })
      .evaluateAll((rows) =>
        rows.map((row) => Number(row.querySelectorAll('td')[0]?.textContent)),
      );
    expect(rankColumn).toEqual([...rankColumn].sort((a, b) => b - a));

    await openRole(page, 'Owner');
    await expect(page.getByText(access.role.owner)).toBeVisible();
    await expect(roleSaveButton(page)).toHaveCount(0);
  });

  test('toggling an action enables Save, Discard restores, and saved permissions survive a reload', async () => {
    await openRole(page, OLD_BROWSER_ROLE);
    const wildcard = access.matrix.wildcard;
    const deleteCell = permissionCell(
      page,
      access.matrix.actions.delete,
      wildcard,
    );
    await expect(deleteCell).not.toBeChecked();
    await expect(roleSaveButton(page)).toBeDisabled();

    await deleteCell.check();
    await expect(page.getByText(access.role.unsaved)).toBeVisible();
    await expect(roleSaveButton(page)).toBeEnabled();
    await roleDiscardButton(page).click();
    await expect(deleteCell).not.toBeChecked();
    await expect(roleSaveButton(page)).toBeDisabled();

    // Field access of one content type: only selected fields.
    const read = permissionCell(page, access.matrix.actions.read, CV_PAGE_SLUG);
    await read.check();
    await page
      .getByRole('button', {
        name: access.matrix.detailsLabel(CV_PAGE_SLUG),
      })
      .click();
    await page.getByRole('radio', { name: access.fields.some }).check();
    const fieldBoxes = page
      .getByRole('group', { name: access.fields.readable })
      .getByRole('checkbox');
    const firstField = fieldBoxes.first();
    await firstField.check();

    await roleSaveButton(page).click();
    await expect(page.getByRole('status')).toContainText(
      access.role.saved.slice(0, 'Permissions saved'.length),
    );

    await page.reload();
    await expect(read).toBeChecked();
    await page
      .getByRole('button', {
        name: access.matrix.detailsLabel(CV_PAGE_SLUG),
      })
      .click();
    await expect(
      page.getByRole('radio', { name: access.fields.some }),
    ).toBeChecked();
    await expect(
      page
        .getByRole('group', { name: access.fields.readable })
        .getByRole('checkbox')
        .first(),
    ).toBeChecked();

    // Put the Editor role back.
    await read.uncheck();
    await roleSaveButton(page).click();
    await expect(page.getByRole('status')).toBeVisible();
    await page.reload();
    await expect(read).not.toBeChecked();
  });

  test('invalid conditions JSON blocks saving; conditions the server rejects mark the row', async () => {
    await openRole(page, OLD_BROWSER_ROLE);
    const read = permissionCell(
      page,
      access.matrix.actions.read,
      access.matrix.wildcard,
    );
    await expect(read).toBeChecked();
    await page
      .getByRole('button', {
        name: access.matrix.detailsLabel(access.matrix.wildcard),
      })
      .click();
    await page
      .getByText(access.conditions.summary(access.matrix.actions.read))
      .click();
    const conditions = page.getByLabel(
      access.conditions.label(access.matrix.actions.read),
    );

    // The JSON check runs when saving: the form message and the field error.
    await conditions.fill(INVALID_JSON);
    await roleSaveButton(page).click();
    await expect(
      page.getByText(access.role.conditionsInvalidJson),
    ).toBeVisible();
    await expect(page.getByText(access.conditions.invalidJson)).toBeVisible();
    await expect(conditions).toHaveAttribute('aria-invalid', 'true');

    await conditions.fill(SERVER_REJECTED_CONDITIONS);
    await roleSaveButton(page).click();
    await expect(page.getByText(access.role.invalid)).toBeVisible();

    await roleDiscardButton(page).click();
  });

  // Last in the serial run: a failure here must not skip the flows above.
  test('Escape and Cancel close the invite dialog and return focus to the Invite button', async () => {
    await page.goto('/accounts');
    const trigger = page.getByRole('button', { name: accounts.invite });
    const dialog = page.getByRole('dialog', { name: invite.title });

    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole('button', { name: invite.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
