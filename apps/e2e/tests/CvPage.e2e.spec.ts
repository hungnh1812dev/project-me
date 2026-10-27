import { expect, type Page, test } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { WEB_COPY } from '../src/Apps.contract';
import { e2eEnv } from '../src/E2e.env';

/**
 * apps/web `/` (CV page) and `/status`. The server renders the main resume as
 * the public role; a reader session refetches once with its Bearer token and
 * falls back to the server data on sign-out. The spec publishes its own main
 * resume (newest wins) and removes it afterwards.
 */
test.describe.configure({ mode: 'serial', retries: 0 });

const RESUME_NAME = `E2E CV ${Date.now()}`;
const RESUME_POSITION = 'E2E Position';
const HTTP_NO_CONTENT = 204;

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
      values: { name: RESUME_NAME, position: RESUME_POSITION, isMain: true },
    },
  });
  const draft = (await created.json()) as {
    documentId: string;
    version: number;
  };
  resumeId = draft.documentId;
  await request.post(
    apiUrl(API_PATHS.document('resume', resumeId) + '/publish'),
    {
      headers: ownerHeaders(),
      data: { expectedVersion: draft.version },
    },
  );
});

test.afterAll(async ({ request }) => {
  const removed = await request.delete(
    apiUrl(API_PATHS.document('resume', resumeId)),
    { headers: ownerHeaders() },
  );
  expect(removed.status()).toBe(HTTP_NO_CONTENT);
});

const headerSignIn = (page: Page) =>
  page.getByRole('button', { name: WEB_COPY.session.signIn, exact: true });

test('anonymous visit renders the name and position on the server and sends no GraphQL request', async ({
  page,
  request,
}) => {
  const html = await (await request.get(e2eEnv.webUrl)).text();
  expect(html).toContain(RESUME_NAME);
  expect(html).toContain(RESUME_POSITION);

  const graphqlCalls: string[] = [];
  page.on('request', (req) => {
    if (isGraphqlRequest(req.url())) graphqlCalls.push(req.url());
  });
  await page.goto(e2eEnv.webUrl);
  await expect(
    page.getByRole('heading', { level: 1, name: RESUME_NAME }),
  ).toBeVisible();
  await expect(page.getByText(RESUME_POSITION)).toBeVisible();
  await expect(page).toHaveTitle(`${RESUME_NAME} - ${RESUME_POSITION}`);
  await expect(headerSignIn(page)).toBeVisible();
  expect(graphqlCalls).toEqual([]);
});

test('a reader session refetches once with its Bearer token and sign-out returns to the server data without a request', async ({
  page,
}) => {
  const graphqlAuth: Array<string | undefined> = [];
  page.on('request', (req) => {
    if (isGraphqlRequest(req.url()))
      graphqlAuth.push(req.headers()['authorization']);
  });
  await page.goto(e2eEnv.webUrl);
  await headerSignIn(page).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: WEB_COPY.login.emailLabel })
    .fill(e2eEnv.readerEmail);
  await dialog
    .getByLabel(WEB_COPY.login.passwordLabel)
    .fill(e2eEnv.readerPassword);
  await dialog.getByRole('button', { name: WEB_COPY.login.submit }).click();

  const signOut = page.getByRole('button', { name: WEB_COPY.session.signOut });
  await expect(signOut).toBeVisible();
  await expect.poll(() => graphqlAuth.length).toBe(1);
  expect(graphqlAuth[0]).toMatch(/^Bearer \S+/);
  await expect(
    page.getByRole('heading', { level: 1, name: RESUME_NAME }),
  ).toBeVisible();

  await signOut.click();
  await expect(headerSignIn(page)).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: RESUME_NAME }),
  ).toBeVisible();
  expect(graphqlAuth).toHaveLength(1);
});

test('/status shows the content API card and is not linked from the home page', async ({
  page,
}) => {
  await page.goto(e2eEnv.webUrl);
  await expect(page.locator('a[href="/status"]')).toHaveCount(0);

  await page.goto(`${e2eEnv.webUrl}/status`);
  await expect(page.getByText(WEB_COPY.status.state.ok)).toBeVisible();
  await page.getByRole('button', { name: WEB_COPY.status.checkAgain }).click();
  await expect(page.getByText(WEB_COPY.status.state.ok)).toBeVisible();
});
