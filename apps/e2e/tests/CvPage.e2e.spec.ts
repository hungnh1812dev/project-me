import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';

import {
  API_PATHS,
  apiUrl,
  BFF_PATHS,
  isCmsApiRequest,
  REMOVED_BFF_PATHS,
} from '../src/Api.endpoints';
import { WEB_COPY } from '../src/Apps.contract';
import { HTTP, PAGE_CV_A_SLUG, PROFILE_SLUG } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { clickAfterHumanCheck, withHumanCheck } from '../src/Session.fixture';

/** Next.js keeps one empty role=alert live region for route changes; it is not an app message. */
const NEXT_ROUTE_ANNOUNCER_SELECTOR = '#__next-route-announcer__';

/**
 * apps/web `/cv/<documentId>` (CV page) and `/` and `/status` (module status). The server renders the
 * main page-cv-a and the profile as the public role; a reader session refetches once through
 * the BFF and falls back to the server data on sign-out. The spec publishes its own main
 * page-cv-a and profile (newest wins) and removes both afterwards.
 */
test.describe('cv page', { tag: ['@web', '@cms-api', '@public-site'] }, () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  const CV_NAME = `E2E CV ${Date.now()}`;
  const CV_POSITION = 'E2E Position';
  const SECRET_COMPANY = `E2E Secret Co ${Date.now()}`;
  const PROFILE_NAME = `E2E Profile ${Date.now()}`;
  const PROFILE_LINKEDIN = 'https://www.linkedin.com/in/e2e-profile';
  const SECRET_PHONE = '+1 555 0142';
  const SECRET_EMAIL = 'e2e-secret@example.com';

  let cvUrl = '';
  let bffCvPath = '';

  const isGraphqlRequest = (url: string): boolean =>
    new URL(url).pathname.endsWith(API_PATHS.GRAPHQL);

  let ownerToken = '';
  let cvId = '';
  let profileId = '';

  const ownerHeaders = () => ({ authorization: `Bearer ${ownerToken}` });

  const publishDraft = async (
    request: APIRequestContext,
    slug: string,
    created: APIResponse,
  ): Promise<string> => {
    const draft = (await created.json()) as { documentId: string; version: number };
    await request.post(apiUrl(`${API_PATHS.document(slug, draft.documentId)}/publish`), {
      headers: ownerHeaders(),
      data: { expectedVersion: draft.version },
    });
    return draft.documentId;
  };

  test.beforeAll(async ({ request }) => {
    const login = await request.post(apiUrl(API_PATHS.AUTH.LOGIN), {
      data: withHumanCheck({ email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword }),
    });
    ownerToken = ((await login.json()) as { accessToken: string }).accessToken;
    const created = await request.post(apiUrl(API_PATHS.documents(PAGE_CV_A_SLUG)), {
      headers: ownerHeaders(),
      data: {
        values: {
          name: CV_NAME,
          position: CV_POSITION,
          isMain: true,
          summary: '<p>Safe <b>text</b></p><img src=x onerror="window.e2ePwned=1">',
        },
        components: {
          experiences: [{ values: { company: SECRET_COMPANY, period: '2020' } }],
        },
      },
    });
    cvId = await publishDraft(request, PAGE_CV_A_SLUG, created);
    cvUrl = `${e2eEnv.webUrl}/cv/${cvId}`;
    bffCvPath = `${BFF_PATHS.CV}/${cvId}`;
    const profile = await request.post(apiUrl(API_PATHS.documents(PROFILE_SLUG)), {
      headers: ownerHeaders(),
      data: {
        values: {
          name: PROFILE_NAME,
          phone: SECRET_PHONE,
          email: SECRET_EMAIL,
          linkedin: PROFILE_LINKEDIN,
        },
      },
    });
    profileId = await publishDraft(request, PROFILE_SLUG, profile);
  });

  test.afterAll(async ({ request }) => {
    const created: [string, string][] = [
      [PAGE_CV_A_SLUG, cvId],
      [PROFILE_SLUG, profileId],
    ];
    for (const [slug, documentId] of created) {
      const removed = await request.delete(apiUrl(API_PATHS.document(slug, documentId)), {
        headers: ownerHeaders(),
      });
      expect(removed.status()).toBe(HTTP.NO_CONTENT);
    }
  });

  const headerSignIn = (page: Page) =>
    page.getByRole('button', { name: WEB_COPY.session.signIn, exact: true });

  test('anonymous visit renders the name and position on the server and sends no GraphQL request', async ({
    page,
    request,
  }) => {
    const html = await (await request.get(cvUrl)).text();
    expect(html).toContain(CV_NAME);
    expect(html).toContain(CV_POSITION);

    const graphqlCalls: string[] = [];
    page.on('request', (req) => {
      if (isGraphqlRequest(req.url())) graphqlCalls.push(req.url());
    });
    await page.goto(cvUrl);
    await expect(page.getByRole('heading', { level: 1, name: CV_NAME })).toBeVisible();
    await expect(page.getByText(CV_POSITION)).toBeVisible();
    await expect(page).toHaveTitle(`${CV_NAME} - ${CV_POSITION}`);
    await expect(headerSignIn(page)).toBeVisible();
    expect(graphqlCalls).toEqual([]);
  });

  test('anonymous visit leaves out masked fields and never shows the raw values or richtext handlers', async ({
    page,
    request,
  }) => {
    const html = await (await request.get(cvUrl)).text();
    expect(html).not.toContain(SECRET_COMPANY);
    expect(html).not.toContain(SECRET_PHONE);
    expect(html).not.toContain(SECRET_EMAIL);
    expect(html).not.toContain('onerror');

    await page.goto(cvUrl);
    await expect(page.getByRole('heading', { level: 1, name: CV_NAME })).toBeVisible();
    await expect(page.getByText(SECRET_COMPANY)).toHaveCount(0);
    await expect(page.getByText('***', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('link', { name: PROFILE_LINKEDIN })).toBeVisible();
    expect(await page.evaluate(() => (window as { e2ePwned?: number }).e2ePwned)).toBeUndefined();
  });

  test('a reader session refetches the CV once through the BFF and sign-out returns to the server data without a request', async ({
    page,
    request,
  }) => {
    expect((await request.get(`${e2eEnv.webUrl}${bffCvPath}`)).status()).toBe(HTTP.UNAUTHORIZED);

    const cvCalls: string[] = [];
    const apiCalls: string[] = [];
    page.on('request', (req) => {
      const { pathname } = new URL(req.url());
      if (pathname === bffCvPath) cvCalls.push(req.headers()['authorization'] ?? '');
      if (isCmsApiRequest(req.url()) || isGraphqlRequest(req.url())) apiCalls.push(pathname);
    });
    await page.goto(cvUrl);
    await headerSignIn(page).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: WEB_COPY.login.emailLabel }).fill(e2eEnv.readerEmail);
    await dialog.getByLabel(WEB_COPY.login.passwordLabel).fill(e2eEnv.readerPassword);
    await expect(dialog.locator('input[name="cf-turnstile-response"]')).not.toHaveValue('');
    await clickAfterHumanCheck(dialog.getByRole('button', { name: WEB_COPY.login.submit }));

    const signOut = page.getByRole('button', { name: WEB_COPY.session.signOut });
    await expect(signOut).toBeVisible();
    await expect.poll(() => cvCalls.length).toBe(1);
    expect(cvCalls[0]).toBe('');
    await expect(page.getByRole('heading', { level: 1, name: CV_NAME })).toBeVisible();

    await signOut.click();
    await expect(headerSignIn(page)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: CV_NAME })).toBeVisible();
    expect(cvCalls).toHaveLength(1);
    expect(apiCalls).toEqual([]);
  });

  test('a failed signed-in refetch keeps the anonymous CV visible with no message and the shell intact', async ({
    page,
  }) => {
    await page.route(`**${bffCvPath}`, (route) =>
      route.fulfill({ status: HTTP.BAD_GATEWAY, body: '' }),
    );
    await page.goto(cvUrl);
    await headerSignIn(page).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: WEB_COPY.login.emailLabel }).fill(e2eEnv.readerEmail);
    await dialog.getByLabel(WEB_COPY.login.passwordLabel).fill(e2eEnv.readerPassword);
    await expect(dialog.locator('input[name="cf-turnstile-response"]')).not.toHaveValue('');
    await clickAfterHumanCheck(dialog.getByRole('button', { name: WEB_COPY.login.submit }));

    await expect(page.getByRole('button', { name: WEB_COPY.session.signOut })).toBeVisible();
    await expect(page.locator(`[role="alert"]:not(${NEXT_ROUTE_ANNOUNCER_SELECTOR})`)).toHaveCount(
      0,
    );
    await expect(page.getByRole('heading', { level: 1, name: CV_NAME })).toBeVisible();
    await expect(page.getByText(CV_POSITION)).toBeVisible();
  });

  test('the home page and /status show the status card', async ({ page, request }) => {
    await page.goto(e2eEnv.webUrl);
    await expect(page.getByText(WEB_COPY.status.state.ok)).toBeVisible();
    await page.getByRole('button', { name: WEB_COPY.status.checkAgain }).click();
    await expect(page.getByText(WEB_COPY.status.state.ok)).toBeVisible();

    expect((await request.get(`${e2eEnv.webUrl}/status`)).status()).toBe(HTTP.OK);
    await page.goto(`${e2eEnv.webUrl}/status`);
    await expect(page.getByText(WEB_COPY.status.state.ok)).toBeVisible();
  });

  test('the removed /bff/v1 path answers 404 on the web origin', async ({ request }) => {
    for (const path of [
      REMOVED_BFF_PATHS.HEALTH,
      REMOVED_BFF_PATHS.SESSION,
      REMOVED_BFF_PATHS.CV,
    ]) {
      expect((await request.get(`${e2eEnv.webUrl}${path}`)).status(), path).toBe(HTTP.NOT_FOUND);
    }
    const login = await request.post(`${e2eEnv.webUrl}${REMOVED_BFF_PATHS.LOGIN}`, { data: {} });
    expect(login.status(), REMOVED_BFF_PATHS.LOGIN).toBe(HTTP.NOT_FOUND);
  });
});
