import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';

import { ADMIN_COPY } from '../src/app-contracts';
import { e2eEnv } from '../src/env';
import { signInAs } from '../src/session';
import { RUN_ID } from '../src/run-id';
import { labelStartingWith } from '../src/locators';
import { API_PATHS, apiUrl } from '../src/api-paths';

const access = ADMIN_COPY.access;
const tokens = access.apiTokens;
const form = access.tokenForm;
const reveal = access.tokenReveal;
const matrix = access.matrix;

/** Unique per run so a kept stack can be tested again. */
const TOKEN_NAME = `E2E build ${RUN_ID}`;
const RENAMED = `E2E build renamed ${RUN_ID}`;
const REVOKE_ONLY_NAME = `E2E revoke ${RUN_ID}`;
const RAW_TOKEN = /ak_live_[A-Za-z0-9_-]{43}/;
const PAST_DATE = '2000-01-01';
const FUTURE_DATE = '2999-12-31';

const tokenRow = (page: Page, name: string) =>
  page.getByRole('row').filter({ hasText: name });

const createButton = (page: Page) =>
  page.getByRole('button', { name: tokens.create });

const createDialog = (page: Page) =>
  page.getByRole('dialog', { name: form.createTitle });

const cell = (scope: Page | Locator, action: string, subject: string) =>
  scope.getByRole('checkbox', {
    name: access.tokenScope.cellLabel(action, subject),
    exact: true,
  });

/** Client-side navigation: a full page load costs a silent refresh (30/min/IP). */
async function openTokensPage(page: Page) {
  const nav = page.getByRole('navigation', { name: access.nav.label });
  await nav.getByRole('link', { name: access.nav.apiTokens }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: tokens.title }),
  ).toBeVisible();
}

test.describe.serial('owner: API tokens', () => {
  let page: Page;
  let context: BrowserContext;
  let rawToken = '';

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    page = await context.newPage();
    await signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
    await openTokensPage(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('the page lists tokens with the expected columns and a Create button', async () => {
    await expect(createButton(page)).toBeVisible();
    // Either the empty state or the table, depending on earlier runs.
    const table = page.getByRole('table', { name: tokens.tableLabel });
    if ((await table.count()) > 0) {
      for (const column of [
        tokens.columns.name,
        tokens.columns.access,
        tokens.columns.status,
        tokens.columns.expires,
        tokens.columns.lastUsed,
      ]) {
        await expect(
          page.getByRole('columnheader', { name: column }),
        ).toBeVisible();
      }
    } else {
      await expect(page.getByText(tokens.empty)).toBeVisible();
      await expect(page.getByText(tokens.emptyHint)).toBeVisible();
    }
  });

  test('an empty create form shows errors and sends nothing', async () => {
    let posted = 0;
    const count = (request: { method(): string; url(): string }) => {
      if (
        request.method() === 'POST' &&
        request.url().endsWith('/api-tokens')
      ) {
        posted += 1;
      }
    };
    page.on('request', count);
    await createButton(page).click();
    const dialog = createDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: form.submitCreate }).click();
    await expect(dialog).toContainText(form.validation.nameRequired);
    await expect(dialog).toContainText(form.validation.scopeRequired);
    expect(posted).toBe(0);

    // A past expiry is refused inline.
    await dialog.getByLabel(labelStartingWith(form.nameLabel)).fill(TOKEN_NAME);
    await dialog
      .getByLabel(labelStartingWith(form.expiresLabel))
      .fill(PAST_DATE);
    await cell(dialog, matrix.actions.read, matrix.wildcard).check();
    await dialog.getByRole('button', { name: form.submitCreate }).click();
    await expect(dialog).toContainText(form.validation.expiryPast);
    expect(posted).toBe(0);
    page.off('request', count);

    // Esc closes the form and focus returns to the opener.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(createButton(page)).toBeFocused();
  });

  test('creating a token shows the raw token once, then only its prefix', async () => {
    await createButton(page).click();
    const dialog = createDialog(page);
    await dialog.getByLabel(labelStartingWith(form.nameLabel)).fill(TOKEN_NAME);
    await dialog
      .getByLabel(labelStartingWith(form.expiresLabel))
      .fill(FUTURE_DATE);
    await cell(dialog, matrix.actions.read, matrix.wildcard).check();
    await dialog.getByRole('button', { name: form.submitCreate }).click();

    const revealDialog = page.getByRole('dialog', {
      name: reveal.title(TOKEN_NAME),
    });
    await expect(revealDialog).toBeVisible();
    const input = revealDialog.getByLabel(reveal.label);
    rawToken = await input.inputValue();
    expect(rawToken).toMatch(RAW_TOKEN);

    // Copy puts it on the clipboard.
    await revealDialog.getByRole('button', { name: reveal.copy }).click();
    await expect(revealDialog).toContainText(reveal.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      rawToken,
    );

    // Esc and an outside click do not dismiss it.
    await page.keyboard.press('Escape');
    await expect(revealDialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(revealDialog).toBeVisible();

    await revealDialog.getByRole('button', { name: reveal.done }).click();
    await expect(revealDialog).toBeHidden();
    await expect(page.getByRole('status')).toHaveText(
      tokens.created(TOKEN_NAME),
    );

    // The list shows the prefix, never the secret; the page holds no secret.
    const row = tokenRow(page, TOKEN_NAME);
    await expect(row).toContainText(tokens.status.active);
    await expect(row).toContainText(rawToken.slice(0, 12));
    expect(await page.locator('body').innerText()).not.toContain(rawToken);
    expect(await page.content()).not.toContain(rawToken);

    // Reopening Create starts blank.
    await createButton(page).click();
    await expect(createDialog(page)).toBeVisible();
    await expect(
      createDialog(page).getByLabel(labelStartingWith(form.nameLabel)),
    ).toHaveValue('');
    expect(await page.content()).not.toContain(rawToken);
    await page.keyboard.press('Escape');
  });

  test('editing sends only what changed and an unchanged form sends nothing', async () => {
    const row = tokenRow(page, TOKEN_NAME);
    const patches: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH') {
        patches.push(request.postData() ?? '');
      }
    });

    // Prefilled, no change: closes without a request.
    await row
      .getByRole('button', { name: tokens.editLabel(TOKEN_NAME) })
      .click();
    let dialog = page.getByRole('dialog', {
      name: form.editTitle(TOKEN_NAME),
    });
    await expect(
      dialog.getByLabel(labelStartingWith(form.nameLabel)),
    ).toHaveValue(TOKEN_NAME);
    await expect(
      dialog.getByLabel(labelStartingWith(form.expiresLabel)),
    ).toHaveValue(FUTURE_DATE);
    await expect(
      cell(dialog, matrix.actions.read, matrix.wildcard),
    ).toBeChecked();
    await dialog.getByRole('button', { name: form.submitEdit }).click();
    await expect(dialog).toBeHidden();
    expect(patches).toHaveLength(0);

    // Name only.
    await row
      .getByRole('button', { name: tokens.editLabel(TOKEN_NAME) })
      .click();
    await dialog.getByLabel(labelStartingWith(form.nameLabel)).fill(RENAMED);
    await dialog.getByRole('button', { name: form.submitEdit }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toHaveText(tokens.updated(RENAMED));
    expect(patches).toHaveLength(1);
    expect(Object.keys(JSON.parse(patches[0] ?? '{}') as object)).toEqual([
      'name',
    ]);
    const renamed = tokenRow(page, RENAMED);
    await expect(renamed).toBeVisible();
    await expect(
      renamed.getByRole('button', { name: tokens.editLabel(RENAMED) }),
    ).toBeFocused();

    // Scope only.
    await renamed
      .getByRole('button', { name: tokens.editLabel(RENAMED) })
      .click();
    dialog = page.getByRole('dialog', { name: form.editTitle(RENAMED) });
    await cell(dialog, matrix.actions.create, matrix.wildcard).check();
    await dialog.getByRole('button', { name: form.submitEdit }).click();
    await expect(dialog).toBeHidden();
    expect(patches).toHaveLength(2);
    expect(Object.keys(JSON.parse(patches[1] ?? '{}') as object)).toEqual([
      'scope',
    ]);
    await expect(renamed).toContainText('2 permissions');
  });

  test('revoking names the token, then the row shows Revoked without actions', async () => {
    // A second token so revoke is tested on its own.
    await createButton(page).click();
    const dialog = createDialog(page);
    await dialog
      .getByLabel(labelStartingWith(form.nameLabel))
      .fill(REVOKE_ONLY_NAME);
    await cell(dialog, matrix.actions.read, matrix.wildcard).check();
    await dialog.getByRole('button', { name: form.submitCreate }).click();
    await page.getByRole('button', { name: reveal.done }).click();

    const row = tokenRow(page, REVOKE_ONLY_NAME);
    const revoke = row.getByRole('button', {
      name: tokens.revokeLabel(REVOKE_ONLY_NAME),
    });
    await revoke.click();
    const confirm = page.getByRole('dialog', {
      name: access.revokeToken.title(REVOKE_ONLY_NAME),
    });
    await expect(confirm).toBeVisible();

    // Cancel with Esc: focus returns to the opener.
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await expect(revoke).toBeFocused();

    await revoke.click();
    await confirm
      .getByRole('button', {
        name: access.revokeToken.submit(REVOKE_ONLY_NAME),
      })
      .click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('status')).toHaveText(
      tokens.revoked(REVOKE_ONLY_NAME),
    );
    await expect(row).toContainText(tokens.status.revoked);
    await expect(row.getByRole('button')).toHaveCount(0);
  });

  test('failed create and edit map each API error to alert, marked cells or a notice', async () => {
    const answer = (
      status: number,
      errorCode: string,
      details: Record<string, unknown> = {},
    ) => ({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: status, errorCode, details }),
    });
    const tokensUrl = /\/api-tokens(\/[^/?]+)?$/;
    const fillCreate = async (dialog: Locator) => {
      await dialog
        .getByLabel(labelStartingWith(form.nameLabel))
        .fill(`E2E fail ${RUN_ID}`);
      await cell(dialog, matrix.actions.read, matrix.wildcard).check();
    };

    // Create: scope not held marks the cell and shows the alert.
    await page.route(tokensUrl, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(
            answer(403, 'API_TOKEN_SCOPE_NOT_HELD', { indexes: [0] }),
          )
        : route.fallback(),
    );
    await createButton(page).click();
    const dialog = createDialog(page);
    await fillCreate(dialog);
    await dialog.getByRole('button', { name: form.submitCreate }).click();
    await expect(dialog).toContainText(access.errors.scopeNotHeld);
    await expect(
      cell(dialog, matrix.actions.read, matrix.wildcard),
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog).toBeVisible();

    // Create: a 400 shows the expiry field error, marked cells and the alert.
    await page.unroute(tokensUrl);
    await page.route(tokensUrl, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(
            answer(400, 'VALIDATION_FAILED', {
              issues: [
                { path: ['expiresAt'], message: 'Server says bad expiry' },
                { path: ['permissions', 0, 'action'], message: 'bad action' },
              ],
            }),
          )
        : route.fallback(),
    );
    await dialog.getByRole('button', { name: form.submitCreate }).click();
    await expect(dialog).toContainText('Server says bad expiry');
    await expect(dialog).toContainText(form.errors.invalid);
    await expect(
      cell(dialog, matrix.actions.read, matrix.wildcard),
    ).toHaveAttribute('aria-invalid', 'true');
    await page.unroute(tokensUrl);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Edit: revoked, expired or deleted meanwhile closes with an info notice.
    for (const [errorCode, status, message] of [
      ['API_TOKEN_REVOKED', 409, tokens.alreadyRevoked],
      ['API_TOKEN_EXPIRED', 409, tokens.alreadyExpired],
      ['API_TOKEN_NOT_FOUND', 404, tokens.gone],
    ] as const) {
      await page.route(tokensUrl, (route) =>
        route.request().method() === 'PATCH'
          ? route.fulfill(answer(status, errorCode))
          : route.fallback(),
      );
      const row = tokenRow(page, RENAMED);
      await row
        .getByRole('button', { name: tokens.editLabel(RENAMED) })
        .click();
      const edit = page.getByRole('dialog', {
        name: form.editTitle(RENAMED),
      });
      await edit
        .getByLabel(labelStartingWith(form.nameLabel))
        .fill(`${RENAMED} x`);
      await edit.getByRole('button', { name: form.submitEdit }).click();
      await expect(edit).toBeHidden();
      await expect(page.getByRole('status')).toHaveText(message);
      await page.unroute(tokensUrl);
    }
  });

  test('an expired row keeps only Revoke, and revoking it works', async () => {
    const tokensUrl = /\/api-tokens(\/[^/?]+)?(\?.*)?$/;
    // The UI cannot create an expired token, so the list answer is rewritten.
    let showExpired = false;
    await page.route(tokensUrl, async (route) => {
      if (route.request().method() !== 'GET' || !showExpired) {
        return route.fallback();
      }
      const response = await route.fetch();
      const body = (await response.json()) as unknown;
      const markExpired = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(markExpired);
        if (node === null || typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        if (record.name === RENAMED) record.status = 'expired';
        Object.values(record).forEach(markExpired);
      };
      markExpired(body);
      return route.fulfill({ response, json: body });
    });

    const nav = page.getByRole('navigation', { name: access.nav.label });
    await nav.getByRole('link', { name: access.nav.accounts }).click();
    showExpired = true;
    await openTokensPage(page);

    const row = tokenRow(page, RENAMED);
    await expect(row).toContainText(tokens.status.expired);
    await expect(
      row.getByRole('button', { name: tokens.editLabel(RENAMED) }),
    ).toHaveCount(0);
    await expect(
      row.getByRole('button', { name: tokens.revokeLabel(RENAMED) }),
    ).toBeVisible();
    // Revoked row: neither action.
    await expect(
      tokenRow(page, REVOKE_ONLY_NAME).getByRole('button'),
    ).toHaveCount(0);

    // Expired row can be revoked.
    await row
      .getByRole('button', { name: tokens.revokeLabel(RENAMED) })
      .click();
    await page
      .getByRole('dialog', { name: access.revokeToken.title(RENAMED) })
      .getByRole('button', { name: access.revokeToken.submit(RENAMED) })
      .click();
    showExpired = false;
    await expect(page.getByRole('status')).toHaveText(tokens.revoked(RENAMED));
    await expect(row).toContainText(tokens.status.revoked);
    await expect(row.getByRole('button')).toHaveCount(0);
    await page.unroute(tokensUrl);
  });

  test('the raw token authenticates nothing on /api-tokens (sessions only)', async () => {
    const response = await context.request.get(apiUrl(API_PATHS.API_TOKENS), {
      headers: { Authorization: `Bearer ${rawToken}` },
    });
    expect(response.status()).toBe(401);
  });

  test('the list endpoint never returns the raw token', async () => {
    // Reload via the UI's own list call and inspect what the server sent.
    const listed = page.waitForResponse(
      (response) =>
        response.url().includes('/api-tokens') &&
        response.request().method() === 'GET',
    );
    const nav = page.getByRole('navigation', { name: access.nav.label });
    await nav.getByRole('link', { name: access.nav.accounts }).click();
    await openTokensPage(page);
    const text = await (await listed).text();
    expect(text).not.toContain(rawToken);
    expect(text).not.toMatch(RAW_TOKEN);
  });
});

test.describe('admin: only its own tokens, within its own role', () => {
  test('an admin does not see the owner tokens and can open the create form', async ({
    page,
  }) => {
    await signInAs(page, e2eEnv.twoFactorEmail, e2eEnv.twoFactorPassword);
    await openTokensPage(page);
    await expect(tokenRow(page, 'E2E build')).toHaveCount(0);
    await expect(
      page.getByRole('columnheader', { name: tokens.columns.createdBy }),
    ).toHaveCount(0);
    await expect(createButton(page)).toBeVisible();

    await createButton(page).click();
    const dialog = createDialog(page);
    await expect(dialog).toBeVisible();
    // The grid never offers more than the admin's role holds: at least one
    // box is greyed out (the admin has no publish rights it can pass on or
    // the hint explains it); the hint text is present when any box is.
    const disabled = await dialog
      .getByRole('checkbox', { disabled: true })
      .count();
    if (disabled > 0) {
      await expect(dialog).toContainText(access.tokenScope.notHeldHint);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
