import { expect, test, type Locator, type Page } from '@playwright/test';

import { accountRow } from '../src/AccessPages.fixture';
import { ADMIN_COPY, contentNewPath } from '../src/Apps.contract';
import { CV_PAGE_SLUG, HTTP, RUN_ID } from '../src/E2e.constants';
import { fakeMediaApi, PNG_BASE64 } from '../src/FakeMediaApi.fixture';
import { labelStartingWith, toast } from '../src/Locators.fixture';
import { accountMenuTrigger, openUserMenu, signInAsOwner } from '../src/Session.fixture';

const access = ADMIN_COPY.access;
const accounts = access.accounts;
const invite = access.invite;
const tokens = access.apiTokens;
const form = access.tokenForm;
const reveal = access.tokenReveal;
const matrix = access.matrix;
const content = ADMIN_COPY.content;
const media = ADMIN_COPY.media;

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 800 };
const NAME_LABEL = /^Position/;
const DOC_NAME = `Toast walk ${RUN_ID}`;
const TOKEN_NAME = `Toast walk token ${RUN_ID}`;
const INVITEE_EMAIL = `e2e-toastwalk-${RUN_ID}@domain.localhost`;
const INVITEE_NAME = `Toast walk ${RUN_ID} invitee`;
const FUTURE_DATE = '2999-12-31';
const RAW_TOKEN = /ak_live_[A-Za-z0-9_-]{43}/;
const SUCCESS_TOAST_MS = 4000;
const ERROR_TOAST_MS = 5000;
const TIMER_SLACK_MS = 2500;
const EDGE_TOLERANCE_PX = 48;
const TOAST_TOP_MAX_PX = 140;

const forcedFailures: string[] = [];
const consoleProblems: string[] = [];
const failedRequests: string[] = [];
const stackedOrderProblems: string[] = [];

const toastRegion = (page: Page): Locator => page.locator('[data-slot="toast-viewport"]');
const anyToast = (page: Page): Locator => page.locator('[data-slot="toast"]');
const button = (page: Page | Locator, name: string): Locator =>
  page.getByRole('button', { name, exact: true });

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  expect(result).not.toBeNull();
  return result as { x: number; y: number; width: number; height: number };
}

async function expectNoOverlap(first: Locator, second: Locator) {
  const a = await box(first);
  const b = await box(second);
  const apart =
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
  expect(apart, `${JSON.stringify(a)} overlaps ${JSON.stringify(b)}`).toBe(true);
}

async function expectToastPlacement(page: Page, viewport: { width: number }) {
  const placed = await box(anyToast(page).first());
  expect(placed.y).toBeLessThan(TOAST_TOP_MAX_PX);
  const centreX = placed.x + placed.width / 2;
  if (viewport.width >= 640) {
    expect(placed.x + placed.width).toBeGreaterThan(viewport.width - EDGE_TOLERANCE_PX);
    expect(centreX).toBeGreaterThan(viewport.width / 2);
  } else {
    expect(Math.abs(centreX - viewport.width / 2)).toBeLessThan(EDGE_TOLERANCE_PX);
  }
}

async function saveDraft(page: Page, value: string) {
  await page.getByLabel(NAME_LABEL).fill(value);
  await button(page, content.save).click();
}

async function openTokensPage(page: Page) {
  const nav = page.getByRole('navigation', { name: access.nav.label });
  await nav.getByRole('link', { name: access.nav.apiTokens }).click();
  await expect(page.getByRole('heading', { level: 1, name: tokens.title })).toBeVisible();
}

/** Opens the create form and submits; the reveal dialog is left open. */
async function createToast(page: Page, name: string) {
  await page.getByRole('button', { name: tokens.create }).click();
  const dialog = page.getByRole('dialog', { name: form.createTitle });
  await dialog.getByLabel(labelStartingWith(form.nameLabel)).fill(name);
  await dialog.getByLabel(labelStartingWith(form.expiresLabel)).fill(FUTURE_DATE);
  await dialog
    .getByRole('checkbox', {
      name: access.tokenScope.cellLabel(matrix.actions.read, matrix.wildcard),
    })
    .check();
  await dialog.getByRole('button', { name: form.submitCreate }).click();
  return page.getByRole('dialog', { name: reveal.title(name) });
}

async function expectCancelThenConfirm(dialog: Locator, cancel: string, confirm: string) {
  const cancelButton = button(dialog, cancel);
  const confirmButton = button(dialog, confirm);
  const cancelBox = await box(cancelButton);
  const confirmBox = await box(confirmButton);
  const stacked = Math.abs(cancelBox.x - confirmBox.x) < 2;
  // Side by side: Cancel left of the confirm. Stacked (narrow): Cancel above it, so Tab follows the picture.
  if (stacked && cancelBox.y > confirmBox.y) {
    stackedOrderProblems.push(`${cancel} sits below ${confirm} but comes first in Tab order`);
  } else if (!stacked) {
    expect(cancelBox.x).toBeLessThan(confirmBox.x);
  }
  await expect(cancelButton).toBeFocused();
  await dialog.page().keyboard.press('Tab');
  await expect(confirmButton).toBeFocused();
}

test.describe.serial('toast walk on the admin shell (APS-D tier 2)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
    page.on('console', (message) => {
      // A failed request is judged by the response listener below, not by its console line.
      if (
        ['error', 'warning'].includes(message.type()) &&
        !message.text().startsWith('Failed to load resource')
      ) {
        consoleProblems.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      const url = response.url();
      if (response.status() < HTTP.BAD_REQUEST) return;
      if (forcedFailures.some((fragment) => url.includes(fragment))) return;
      // The silent refresh before sign-in answers 401 by design.
      if (response.status() === HTTP.UNAUTHORIZED && url.endsWith('/auth/refresh')) return;
      failedRequests.push(`${response.status()} ${response.request().method()} ${url}`);
    });
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('CAPSD-8 desktop: a draft save shows one success toast top right, replaces on a second save and leaves no inline notice', async () => {
    await page.goto(contentNewPath(CV_PAGE_SLUG));
    await expect(page.getByLabel(NAME_LABEL)).toBeVisible();

    await saveDraft(page, DOC_NAME);
    const saved = toast(page, content.saved);
    await expect(saved).toBeVisible();
    await expect(saved).toHaveAttribute('data-tone', 'success');
    await expect(saved.locator('svg').first()).toBeVisible();
    await expectToastPlacement(page, DESKTOP);
    await expect(page.getByRole('main').getByText(content.saved)).toHaveCount(0);

    // A second save while the first still shows replaces it.
    await saveDraft(page, `${DOC_NAME} again`);
    await expect(anyToast(page)).toHaveCount(1);
    await expect(toast(page, content.saved)).toBeVisible();

    const shownAt = Date.now();
    await expect(anyToast(page)).toHaveCount(0, { timeout: SUCCESS_TOAST_MS + TIMER_SLACK_MS });
    expect(Date.now() - shownAt).toBeLessThan(SUCCESS_TOAST_MS + TIMER_SLACK_MS);
  });

  test('CAPSD-13 desktop: the document bar puts Discard apart at the left and Publish at the right', async () => {
    const discard = await box(button(page, content.actions.discard));
    const save = await box(button(page, content.save));
    const publish = await box(button(page, content.actions.publish));
    expect(discard.x).toBeLessThan(save.x);
    expect(discard.x).toBeLessThan(publish.x);
    expect(publish.x).toBeGreaterThan(save.x);
    expect(publish.x + publish.width).toBeGreaterThan(DESKTOP.width - 2 * EDGE_TOLERANCE_PX - 300);
  });

  test('CAPSD-8, 13, 19 at 375 px: toast top centre, no overlap with the action bar, bar order kept', async () => {
    await page.setViewportSize(MOBILE);
    await saveDraft(page, `${DOC_NAME} narrow`);
    const saved = toast(page, content.saved);
    await expect(saved).toBeVisible();
    await expect(saved).toHaveAttribute('data-tone', 'success');
    await expectToastPlacement(page, MOBILE);
    await expect(anyToast(page)).toHaveCount(1);
    await expect(page.getByRole('main').getByText(content.saved)).toHaveCount(0);

    for (const name of [content.save, content.actions.publish, content.actions.discard]) {
      await expectNoOverlap(saved, button(page, name));
    }
    const discard = await box(button(page, content.actions.discard));
    const publish = await box(button(page, content.actions.publish));
    expect(discard.x).toBeLessThanOrEqual(publish.x);
    await expect(anyToast(page)).toHaveCount(0, { timeout: SUCCESS_TOAST_MS + TIMER_SLACK_MS });
    await page.setViewportSize(DESKTOP);
  });

  test('CAPSD-10, 12 tokens: toast keyboard and pointer behaviour, the raw token stays inline', async () => {
    await openTokensPage(page);
    const revealDialog = await createToast(page, TOKEN_NAME);
    await expect(revealDialog).toBeVisible();
    const rawToken = await revealDialog.getByLabel(reveal.label).inputValue();
    expect(rawToken).toMatch(RAW_TOKEN);
    await expect(toastRegion(page)).not.toContainText(rawToken);
    await expect(anyToast(page)).toHaveCount(0);

    await revealDialog.getByRole('button', { name: reveal.done }).click();
    const created = toast(page, tokens.created(TOKEN_NAME));
    await expect(created).toBeVisible();
    await expect(created).toHaveAttribute('data-tone', 'success');
    expect(await toastRegion(page).innerText()).not.toMatch(RAW_TOKEN);
    await expect(created.getByRole('button')).toHaveAccessibleName(/.+/);

    // Hovering pauses the timer: still there well past 4 s; leaving lets it go.
    await created.hover();
    await page.waitForTimeout(SUCCESS_TOAST_MS + 1500);
    await expect(created).toBeVisible();
    await page.mouse.move(2, 400);
    await expect(created).toBeHidden({ timeout: SUCCESS_TOAST_MS + TIMER_SLACK_MS });

    // The top bar menu and the sidebar still work with a toast showing.
    const second = await createToast(page, `${TOKEN_NAME} 2`);
    await second.getByRole('button', { name: reveal.done }).click();
    await expect(anyToast(page)).toHaveCount(1);
    const menu = await openUserMenu(page);
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(anyToast(page)).toHaveCount(1);

    // F8 moves focus to the region; Esc closes the focused toast.
    await page.keyboard.press('F8');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-slot') ?? ''))
      .toBe('toast-viewport');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(anyToast(page)).toHaveCount(0);

    const third = await createToast(page, `${TOKEN_NAME} 3`);
    await third.getByRole('button', { name: reveal.done }).click();
    await expect(anyToast(page)).toHaveCount(1);
    const nav = page.getByRole('navigation', { name: access.nav.label });
    await nav.getByRole('link', { name: access.nav.accounts }).click();
    await expect(page).toHaveURL(/\/accounts$/);
    await expect(accountMenuTrigger(page)).toBeVisible();
  });

  test('CAPSD-13, 19 revoke dialog: Cancel left, named destructive confirm right; no toast over the confirm at 375 px', async () => {
    await openTokensPage(page);
    const row = page.getByRole('row').filter({ has: page.getByText(TOKEN_NAME, { exact: true }) });
    for (const viewport of [DESKTOP, MOBILE]) {
      await page.setViewportSize(viewport);
      if (viewport === MOBILE) {
        const fresh = await createToast(page, `${TOKEN_NAME} 4`);
        await fresh.getByRole('button', { name: reveal.done }).click();
        await expect(anyToast(page)).toHaveCount(1);
      }
      await row.getByRole('button', { name: tokens.revokeLabel(TOKEN_NAME) }).click();
      const dialog = page.getByRole('dialog', { name: access.revokeToken.title(TOKEN_NAME) });
      await expect(dialog).toBeVisible();
      await expectCancelThenConfirm(
        dialog,
        access.revokeToken.cancel,
        access.revokeToken.submit(TOKEN_NAME),
      );
      if (viewport === MOBILE && (await anyToast(page).count()) > 0) {
        await expectNoOverlap(
          anyToast(page).first(),
          button(dialog, access.revokeToken.submit(TOKEN_NAME)),
        );
      }
      // Esc closes it with a toast showing, and revokes nothing.
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(row).not.toContainText(tokens.status.revoked);
    }
    await page.setViewportSize(DESKTOP);
  });

  test('CAPSD-10, 11, 13 accounts: invite and resend toasts, an assertive error toast on a failed row action, disable dialog order', async () => {
    await page.goto('/accounts');
    await page.getByRole('button', { name: accounts.invite }).click();
    const dialog = page.getByRole('dialog', { name: invite.title });
    await dialog.getByLabel(labelStartingWith(invite.emailLabel)).fill(INVITEE_EMAIL);
    await dialog.getByLabel(labelStartingWith(invite.displayNameLabel)).fill(INVITEE_NAME);
    await dialog.getByLabel(labelStartingWith(invite.roleLabel)).selectOption('Editor');
    await dialog.getByRole('button', { name: invite.submit }).click();
    await expect(dialog).toBeHidden();
    const invited = toast(page, accounts.invited);
    await expect(invited).toBeVisible();
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: accounts.invited }),
    ).toHaveCount(1);
    await expect(toastRegion(page)).not.toContainText(INVITEE_EMAIL);
    const row = accountRow(page, INVITEE_EMAIL);
    await expect(row).toContainText(accounts.status.invited);

    // Forced failure: the resend call answers 500; the row keeps its state.
    forcedFailures.push('/invite/resend');
    await page.route('**/invite/resend', (route) =>
      route.fulfill({ status: HTTP.SERVER_ERROR, contentType: 'application/json', body: '{}' }),
    );
    await row.getByRole('button', { name: accounts.resendLabel(INVITEE_NAME) }).click();
    const failed = page.locator('[data-slot="toast"][data-tone="error"]');
    await expect(failed).toBeVisible();
    await expect(page.locator('[aria-live="assertive"]').filter({ hasText: /\S/ })).not.toHaveCount(
      0,
    );
    await expect(row).toContainText(accounts.status.invited);
    await expect(toastRegion(page)).not.toContainText(INVITEE_EMAIL);
    const shownAt = Date.now();
    await expect(failed).toBeHidden({ timeout: ERROR_TOAST_MS + TIMER_SLACK_MS });
    expect(Date.now() - shownAt).toBeGreaterThan(ERROR_TOAST_MS - 2500);
    await page.unroute('**/invite/resend');

    // Success resend: polite announcement; newest toast on top when two show.
    await row.getByRole('button', { name: accounts.resendLabel(INVITEE_NAME) }).click();
    const resent = toast(page, accounts.resent);
    await expect(resent).toBeVisible();
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: accounts.resent }),
    ).toHaveCount(1);
    expect(await anyToast(page).count()).toBeLessThanOrEqual(3);

    // Disable dialog: Cancel left of the named destructive confirm.
    for (const viewport of [DESKTOP, MOBILE]) {
      await page.setViewportSize(viewport);
      await row.getByRole('button', { name: accounts.disableLabel(INVITEE_NAME) }).click();
      const confirm = page.getByRole('dialog', { name: access.disable.title(INVITEE_NAME) });
      await expect(confirm).toBeVisible();
      await expectCancelThenConfirm(
        confirm,
        access.disable.cancel,
        access.disable.submit(INVITEE_NAME),
      );
      await page.keyboard.press('Escape');
      await expect(confirm).toBeHidden();
      await expect(row).not.toContainText(accounts.status.disabled);
    }
    await page.setViewportSize(DESKTOP);
  });

  test('CAPSD-9 an upload set where one file fails shows a warning toast', async () => {
    await fakeMediaApi(page.context(), new Set());
    forcedFailures.push('/media');
    let posts = 0;
    await page.route('**/media', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posts += 1;
      if (posts === 1) return route.fallback();
      return route.fulfill({
        status: HTTP.UNSUPPORTED_MEDIA_TYPE,
        contentType: 'application/json',
        body: '{}',
      });
    });
    const nav = page.getByRole('navigation', { name: access.nav.label });
    await nav.getByRole('link', { name: access.nav.media }).click();
    await expect(page.getByRole('heading', { name: media.title })).toBeVisible();
    await page.getByRole('button', { name: media.upload, exact: true }).click();
    const dialog = page.getByRole('dialog');
    const png = Buffer.from(PNG_BASE64, 'base64');
    await dialog.getByTestId('upload-dialog-input').setInputFiles([
      { name: `toastwalk-a-${RUN_ID}.png`, mimeType: 'image/png', buffer: png },
      { name: `toastwalk-b-${RUN_ID}.png`, mimeType: 'image/png', buffer: png },
    ]);
    await dialog.getByRole('button', { name: /^Upload/ }).click();
    await dialog.getByRole('button', { name: media.uploadDialog.close, exact: true }).click();
    const partial = toast(page, media.uploadedSomeFailed(1, 2));
    await expect(partial).toBeVisible();
    await expect(partial).toHaveAttribute('data-tone', 'warning');
    await page.unroute('**/media');
  });

  test('CAPSD-18 the walk left no console error or warning and no unexpected failed request', () => {
    expect(consoleProblems).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test('CAPSD-13 at 375 px a stacked dialog footer keeps Tab order equal to the visual order', () => {
    expect(stackedOrderProblems).toEqual([]);
  });
});
