import { expect, test, type Page, type Route } from '@playwright/test';

import {
  ADMIN_COPY,
  API_ENDPOINTS,
  API_ERROR_CODES,
  APP_ROUTES,
} from '../src/Apps.contract';
import { HTTP } from '../src/E2e.constants';
import { signInAsOwner, signInAsOwnerWithRole } from '../src/Session.fixture';

const copy = ADMIN_COPY.backups;
const security = ADMIN_COPY.security;
const nav = ADMIN_COPY.access.nav;
const LIST_URL = `**${API_ENDPOINTS.BACKUPS.LIST}`;
const LINKS_URL = `**${API_ENDPOINTS.BACKUPS.DOWNLOAD_LINKS}`;
const LIST_URL_EXACT = /\/backups$/;
const FORBIDDEN = 403;
const SERVER_ERROR = 500;
const CREATED = 201;
const TOO_MANY = 429;
const RETRY_AFTER_SECONDS = '90';
const BYTES_PER_MIB = 1024 * 1024;
const NIGHTLY_MIB = 184.2;
const MONTHLY_MIB = 2;
const FILE_SOON = 'abyss-2026-10-27T03-00-00Z.dump.age';
const FILE_OLD = 'abyss-2026-10-01T03-00-00Z.dump.age';
const SECOND_FACTOR_OWNER = {
  twoFactorEnabled: true,
  twoFactorMethod: 'totp',
};

const row = (
  fileName: string,
  createdAt: string,
  mib: number,
  kind: string,
) => ({
  key: `backups/${fileName}`,
  kind,
  fileName,
  createdAt,
  sizeBytes: Math.round(mib * BYTES_PER_MIB),
});

const fixtureList = (isStale = false, data?: unknown[]) => ({
  data: data ?? [
    row(FILE_SOON, '2026-10-27T03:00:00.000Z', NIGHTLY_MIB, 'daily'),
    row(FILE_OLD, '2026-10-01T03:00:00.000Z', MONTHLY_MIB, 'monthly'),
  ],
  meta: {
    count: data?.length ?? 2,
    totalBytes: Math.round((NIGHTLY_MIB + MONTHLY_MIB) * BYTES_PER_MIB),
    latestAt: data?.length === 0 ? null : '2026-10-27T03:00:00.000Z',
    isStale,
  },
});

const fulfillJson = (route: Route, status: number, json: unknown) =>
  route.fulfill({ status, json });

const isListFetch = (route: Route): boolean =>
  route.request().method() === 'GET' &&
  ['fetch', 'xhr'].includes(route.request().resourceType());

async function stubList(page: Page, status: number, json: unknown) {
  await page.route(LIST_URL, (route) =>
    isListFetch(route) ? fulfillJson(route, status, json) : route.fallback(),
  );
}

async function stubOwnerWithTwoFactor(page: Page) {
  await page.route(`**${API_ENDPOINTS.AUTH.ME}`, async (route) => {
    const response = await route.fetch();
    const user = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      response,
      json: { ...user, ...SECOND_FACTOR_OWNER },
    });
  });
}

const mainMenu = (page: Page) =>
  page.getByRole('navigation', { name: nav.label });
const backupsLink = (page: Page) =>
  mainMenu(page).getByRole('link', { name: copy.nav, exact: true });

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('backups page', () => {
  test('feature off: no menu item, page shows the not-configured state', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await signInAsOwner(page);
    await expect(mainMenu(page)).toBeVisible();
    await expect(backupsLink(page)).toHaveCount(0);

    await page.goto(APP_ROUTES.BACKUPS);
    await expect(page.getByText(copy.notConfigured.title)).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('owner with backups: menu item, rows, stale banner, age note, tooltip', async ({
    page,
  }) => {
    await stubList(page, HTTP.OK, fixtureList(true));
    await signInAsOwner(page);
    await expect(backupsLink(page)).toBeVisible();
    await backupsLink(page).click();

    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await expect(page.getByText(copy.summary.count(2))).toBeVisible();
    await expect(page.getByText(copy.stale)).toBeVisible();
    await expect(page.getByText(copy.encryptedNote)).toBeVisible();
    const table = page.getByRole('table', { name: copy.tableLabel });
    await expect(table.getByText('184.2 MiB')).toBeVisible();
    await expect(table.getByText(copy.kind.monthly)).toBeVisible();
    await expect(table.locator('time').first()).toHaveAttribute(
      'title',
      copy.utc('2026-10-27 03:00'),
    );
    const rows = table.getByRole('row');
    await expect(rows.nth(1)).toContainText(copy.kind.daily);
  });

  test('empty list shows the empty state; 500 shows an error with retry', async ({
    page,
  }) => {
    await stubList(page, HTTP.OK, fixtureList(false, []));
    await signInAsOwner(page);
    await page.goto(APP_ROUTES.BACKUPS);
    await expect(page.getByText(copy.empty, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.emptyHint)).toBeVisible();

    await page.unroute(LIST_URL);
    await stubList(page, SERVER_ERROR, { errorCode: 'INTERNAL' });
    await page.goto(APP_ROUTES.BACKUPS);
    await expect(page.getByText(copy.loadFailed)).toBeVisible({
      timeout: 20_000,
    });
    await page.unroute(LIST_URL);
    await stubList(page, HTTP.OK, fixtureList());
    await page.getByRole('button', { name: /retry|try again/i }).click();
    await expect(
      page.getByRole('table', { name: copy.tableLabel }),
    ).toBeVisible();
  });

  test('non-owner: no menu item, no list request from the menu, page says forbidden', async ({
    page,
  }) => {
    const listRequests: string[] = [];
    page.on('request', (request) => {
      if (LIST_URL_EXACT.test(new URL(request.url()).pathname)) {
        listRequests.push(request.url());
      }
    });
    await signInAsOwnerWithRole(page, 'editor');
    await expect(mainMenu(page)).toBeVisible();
    await expect(backupsLink(page)).toHaveCount(0);
    expect(listRequests).toEqual([]);

    await stubList(page, FORBIDDEN, { errorCode: 'AUTH_FORBIDDEN' });
    await page.goto(APP_ROUTES.BACKUPS);
    await expect(page.getByText(copy.forbidden)).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
  });
});

test.describe('backup download dialog', () => {
  const openDialog = async (page: Page) => {
    await page.goto(APP_ROUTES.BACKUPS);
    await page
      .getByRole('button', { name: copy.download.buttonLabel(FILE_SOON) })
      .click();
    return page.getByRole('dialog', { name: copy.dialog.title(FILE_SOON) });
  };

  test('owner without 2FA sees the pointer to security settings, no form', async ({
    page,
  }) => {
    await stubList(page, HTTP.OK, fixtureList());
    await signInAsOwner(page);
    const dialog = await openDialog(page);
    await expect(dialog.getByText(copy.dialog.description)).toBeVisible();
    await expect(dialog.getByText(copy.dialog.twoFactorOff)).toBeVisible();
    await expect(
      dialog.getByLabel(security.fields.currentPassword),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole('link', { name: copy.dialog.openSecurity }),
    ).toHaveAttribute('href', APP_ROUTES.SECURITY_SETTINGS);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('2FA owner: validation, wrong code, wrong password, rate limit, success', async ({
    page,
  }) => {
    await stubList(page, HTTP.OK, fixtureList());
    await stubOwnerWithTwoFactor(page);
    const posted: unknown[] = [];
    let answer: () => {
      status: number;
      json: unknown;
      headers?: Record<string, string>;
    } = () => ({ status: FORBIDDEN, json: {} });
    await page.route(LINKS_URL, async (route) => {
      posted.push(route.request().postDataJSON());
      const { status, json, headers } = answer();
      await route.fulfill({ status, json, ...(headers ? { headers } : {}) });
    });
    await signInAsOwner(page);
    const dialog = await openDialog(page);
    const code = dialog.getByLabel(security.fields.totpCode, { exact: false });
    const password = dialog.getByLabel(security.fields.currentPassword);
    const submit = dialog.getByRole('button', { name: copy.dialog.submit });

    await submit.click();
    await expect(
      dialog.getByText(security.validation.codeInvalid),
    ).toBeVisible();
    expect(posted).toEqual([]);

    answer = () => ({
      status: FORBIDDEN,
      json: { errorCode: API_ERROR_CODES.INVALID_2FA_CODE },
    });
    await code.fill('123456');
    await password.fill('pw-one');
    await submit.click();
    await expect(dialog.getByText(security.errors.invalidCode)).toBeVisible();

    answer = () => ({
      status: FORBIDDEN,
      json: { errorCode: API_ERROR_CODES.INVALID_CREDENTIALS },
    });
    await code.fill('123456');
    await password.fill('pw-two');
    await submit.click();
    await expect(dialog.getByText(security.errors.wrongPassword)).toBeVisible();

    answer = () => ({
      status: TOO_MANY,
      json: { errorCode: 'RATE_LIMITED' },
      headers: { 'Retry-After': RETRY_AFTER_SECONDS },
    });
    await code.fill('123456');
    await password.fill('pw-three');
    await submit.click();
    await expect(dialog.getByText(/try again/i)).toBeVisible();

    const target = '/__backup-target';
    answer = () => ({
      status: CREATED,
      json: {
        url: target,
        fileName: FILE_SOON,
        expiresAt: '2030-01-01T00:00:00Z',
      },
    });
    await page.route(`**${target}`, (route) =>
      route.fulfill({
        status: HTTP.OK,
        body: 'dump',
        contentType: 'text/plain',
      }),
    );
    await code.fill('654321');
    await password.fill('pw-four');
    await submit.click();
    await expect(page).toHaveURL(new RegExp(`${target}$`));
    expect(posted.at(-1)).toEqual({
      key: `backups/${FILE_SOON}`,
      password: 'pw-four',
      code: '654321',
    });
  });
});
