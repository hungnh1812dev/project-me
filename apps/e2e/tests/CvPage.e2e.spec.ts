import { expect, test, type Page } from '@playwright/test';

import {
  API_PATHS,
  apiUrl,
  BFF_PATHS,
  isCmsApiRequest,
  REMOVED_BFF_PATHS,
} from '../src/Api.endpoints';
import { WEB_COPY } from '../src/Apps.contract';
import { HTTP } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';

/**
 * apps/web `/cv` (CV page) and `/` (status view). The server renders the main resume as
 * the public role; a reader session refetches once through the BFF and
 * falls back to the server data on sign-out. The spec publishes its own main
 * resume (newest wins) and removes it afterwards.
 */
test.describe.configure({ mode: 'serial', retries: 0 });

const RESUME_NAME = `E2E CV ${Date.now()}`;
const RESUME_POSITION = 'E2E Position';
const SECRET_COMPANY = `E2E Secret Co ${Date.now()}`;
const SECRET_PHONE = '+1 555 0142';
const MIN_MASKED_PLACEHOLDERS = 2;

const cvUrl = `${e2eEnv.webUrl}/cv`;

const isGraphqlRequest = (url: string): boolean =>
  new URL(url).pathname.endsWith(API_PATHS.GRAPHQL);

let ownerToken = '';
let resumeId = '';

const ownerHeaders = () => ({ authorization: `Bearer ${ownerToken}` });

test.beforeAll(async ({ request }) => {
  const login = await request.post(apiUrl(API_PATHS.AUTH.LOGIN), {
    data: { email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword },
  });
  ownerToken = ((await login.json()) as { accessToken: string }).accessToken;
  const created = await request.post(apiUrl(API_PATHS.documents('resume')), {
    headers: ownerHeaders(),
    data: {
      values: {
        name: RESUME_NAME,
        position: RESUME_POSITION,
        isMain: true,
        summary: '<p>Safe <b>text</b></p><img src=x onerror="window.e2ePwned=1">',
      },
      components: {
        experiences: [{ values: { company: SECRET_COMPANY, period: '2020' } }],
        referees: [{ values: { name: 'E2E Referee', phone: SECRET_PHONE } }],
      },
    },
  });
  const draft = (await created.json()) as {
    documentId: string;
    version: number;
  };
  resumeId = draft.documentId;
  await request.post(apiUrl(API_PATHS.document('resume', resumeId) + '/publish'), {
    headers: ownerHeaders(),
    data: { expectedVersion: draft.version },
  });
});

test.afterAll(async ({ request }) => {
  const removed = await request.delete(apiUrl(API_PATHS.document('resume', resumeId)), {
    headers: ownerHeaders(),
  });
  expect(removed.status()).toBe(HTTP.NO_CONTENT);
});

const headerSignIn = (page: Page) =>
  page.getByRole('button', { name: WEB_COPY.session.signIn, exact: true });

test('anonymous visit renders the name and position on the server and sends no GraphQL request', async ({
  page,
  request,
}) => {
  const html = await (await request.get(cvUrl)).text();
  expect(html).toContain(RESUME_NAME);
  expect(html).toContain(RESUME_POSITION);

  const graphqlCalls: string[] = [];
  page.on('request', (req) => {
    if (isGraphqlRequest(req.url())) graphqlCalls.push(req.url());
  });
  await page.goto(cvUrl);
  await expect(page.getByRole('heading', { level: 1, name: RESUME_NAME })).toBeVisible();
  await expect(page.getByText(RESUME_POSITION)).toBeVisible();
  await expect(page).toHaveTitle(`${RESUME_NAME} - ${RESUME_POSITION}`);
  await expect(headerSignIn(page)).toBeVisible();
  expect(graphqlCalls).toEqual([]);
});

test('anonymous visit shows placeholders for masked fields and never the raw values or richtext handlers', async ({
  page,
  request,
}) => {
  const html = await (await request.get(cvUrl)).text();
  expect(html).not.toContain(SECRET_COMPANY);
  expect(html).not.toContain(SECRET_PHONE);
  expect(html).not.toContain('onerror');

  await page.goto(cvUrl);
  await expect
    .poll(() => page.getByText(WEB_COPY.cv.maskedValue, { exact: true }).count())
    .toBeGreaterThanOrEqual(MIN_MASKED_PLACEHOLDERS);
  await expect(page.getByText('***', { exact: false })).toHaveCount(0);
  await expect(page.getByText('E2E Referee')).toBeVisible();
  expect(await page.evaluate(() => (window as { e2ePwned?: number }).e2ePwned)).toBeUndefined();
});

test('a reader session refetches the CV once through the BFF and sign-out returns to the server data without a request', async ({
  page,
  request,
}) => {
  expect((await request.get(`${e2eEnv.webUrl}${BFF_PATHS.CV}`)).status()).toBe(HTTP.UNAUTHORIZED);

  const cvCalls: string[] = [];
  const apiCalls: string[] = [];
  page.on('request', (req) => {
    const { pathname } = new URL(req.url());
    if (pathname === BFF_PATHS.CV) cvCalls.push(req.headers()['authorization'] ?? '');
    if (isCmsApiRequest(req.url()) || isGraphqlRequest(req.url())) apiCalls.push(pathname);
  });
  await page.goto(cvUrl);
  await headerSignIn(page).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: WEB_COPY.login.emailLabel }).fill(e2eEnv.readerEmail);
  await dialog.getByLabel(WEB_COPY.login.passwordLabel).fill(e2eEnv.readerPassword);
  await expect(dialog.locator('input[name="cf-turnstile-response"]')).not.toHaveValue('');
  await dialog.getByRole('button', { name: WEB_COPY.login.submit }).click();

  const signOut = page.getByRole('button', { name: WEB_COPY.session.signOut });
  await expect(signOut).toBeVisible();
  await expect.poll(() => cvCalls.length).toBe(1);
  expect(cvCalls[0]).toBe('');
  await expect(page.getByRole('heading', { level: 1, name: RESUME_NAME })).toBeVisible();

  await signOut.click();
  await expect(headerSignIn(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: RESUME_NAME })).toBeVisible();
  expect(cvCalls).toHaveLength(1);
  expect(apiCalls).toEqual([]);
});

test('the home page shows the status view and /status is gone', async ({ page, request }) => {
  await page.goto(e2eEnv.webUrl);
  await expect(page.getByText(WEB_COPY.status.state.ok)).toBeVisible();
  await page.getByRole('button', { name: WEB_COPY.status.checkAgain }).click();
  await expect(page.getByText(WEB_COPY.status.state.ok)).toBeVisible();

  expect((await request.get(`${e2eEnv.webUrl}/status`)).status()).toBe(HTTP.NOT_FOUND);
});

test('the removed /bff/v1 path answers 404 on the web origin', async ({ request }) => {
  for (const path of [REMOVED_BFF_PATHS.HEALTH, REMOVED_BFF_PATHS.SESSION, REMOVED_BFF_PATHS.CV]) {
    expect((await request.get(`${e2eEnv.webUrl}${path}`)).status(), path).toBe(HTTP.NOT_FOUND);
  }
  const login = await request.post(`${e2eEnv.webUrl}${REMOVED_BFF_PATHS.LOGIN}`, { data: {} });
  expect(login.status(), REMOVED_BFF_PATHS.LOGIN).toBe(HTTP.NOT_FOUND);
});
