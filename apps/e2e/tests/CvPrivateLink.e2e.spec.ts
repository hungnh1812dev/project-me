import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

import { API_PATHS, apiUrl, BFF_PATHS } from '../src/Api.endpoints';
import { WEB_COPY } from '../src/Apps.contract';
import { HTTP, PAGE_CV_A_SLUG } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { clickAfterHumanCheck, withHumanCheck } from '../src/Session.fixture';

const NO_INDEX_HEADER = 'noindex, nofollow, noarchive, nosnippet';
const UNKNOWN_DOCUMENT_ID = '00000000-0000-4000-8000-000000000000';
const MALFORMED_DOCUMENT_ID = 'abc';
const NOT_FOUND_HEADING = 'Page not found';
const REDIRECT_PERMANENT = 308;
const BFF_NOT_FOUND_CODE = 'BFF_NOT_FOUND';
const BFF_SESSION_REQUIRED_CODE = 'BFF_SESSION_REQUIRED';

/**
 * apps/web `/cv/<documentId>` private link (cv-private-link CPL-A): the page states, the id
 * variants, the BFF `GET /api/v1/cv/<documentId>` answers and the signed-in refetch. The spec
 * publishes one CV, keeps a second one as a draft, and removes both afterwards.
 */
test.describe('cv private link', { tag: ['@web', '@cms-api', '@public-site'] }, () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  const CV_NAME = `E2E Link CV ${Date.now()}`;
  const DRAFT_NAME = `E2E Link Draft ${Date.now()}`;
  const CV_POSITION = 'E2E Link Position';

  let ownerToken = '';
  let publishedId = '';
  let draftId = '';

  const webUrl = (path: string): string => `${e2eEnv.webUrl}${path}`;
  const ownerHeaders = () => ({ authorization: `Bearer ${ownerToken}` });

  const createCv = async (
    request: APIRequestContext,
    name: string,
  ): Promise<{ documentId: string; version: number }> => {
    const created: APIResponse = await request.post(apiUrl(API_PATHS.documents(PAGE_CV_A_SLUG)), {
      headers: ownerHeaders(),
      data: { values: { name, position: CV_POSITION, isMain: false, summary: '<p>Link CV</p>' } },
    });
    return (await created.json()) as { documentId: string; version: number };
  };

  test.beforeAll(async ({ request }) => {
    const login = await request.post(apiUrl(API_PATHS.AUTH.LOGIN), {
      data: withHumanCheck({ email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword }),
    });
    ownerToken = ((await login.json()) as { accessToken: string }).accessToken;
    const published = await createCv(request, CV_NAME);
    publishedId = published.documentId;
    await request.post(apiUrl(`${API_PATHS.document(PAGE_CV_A_SLUG, publishedId)}/publish`), {
      headers: ownerHeaders(),
      data: { expectedVersion: published.version },
    });
    draftId = (await createCv(request, DRAFT_NAME)).documentId;
  });

  test.afterAll(async ({ request }) => {
    for (const documentId of [publishedId, draftId]) {
      const removed = await request.delete(apiUrl(API_PATHS.document(PAGE_CV_A_SLUG, documentId)), {
        headers: ownerHeaders(),
      });
      expect(removed.status()).toBe(HTTP.NO_CONTENT);
    }
  });

  test('the CV renders with its title and safe outbound links', async ({ page }) => {
    await page.goto(webUrl(`/cv/${publishedId}`));
    await expect(page.getByRole('heading', { level: 1, name: CV_NAME })).toBeVisible();
    await expect(page).toHaveTitle(`${CV_NAME} - ${CV_POSITION}`);
    const rels = await page
      .locator('main a[href^="http"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('rel') ?? ''));
    for (const rel of rels) {
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    }
  });

  test('/cv, a malformed id and an unknown id give the same 404 page', async ({
    page,
    request,
  }) => {
    const seen: { status: number; robots: string | undefined }[] = [];
    for (const path of ['/cv', `/cv/${MALFORMED_DOCUMENT_ID}`, `/cv/${UNKNOWN_DOCUMENT_ID}`]) {
      const response = await request.get(webUrl(path));
      seen.push({ status: response.status(), robots: response.headers()['x-robots-tag'] });
      await page.goto(webUrl(path));
      await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible();
    }
    for (const entry of seen) {
      expect(entry).toEqual({ status: HTTP.NOT_FOUND, robots: NO_INDEX_HEADER });
    }
  });

  test('the id variants follow the plain id and carry the no-index header', async ({ request }) => {
    const upper = await request.get(webUrl(`/cv/${publishedId.toUpperCase()}`));
    expect(upper.status()).toBe(HTTP.OK);
    expect(upper.headers()['x-robots-tag']).toBe(NO_INDEX_HEADER);

    const slash = await request.get(webUrl(`/cv/${publishedId}/`), { maxRedirects: 0 });
    expect(slash.status()).toBe(REDIRECT_PERMANENT);
    expect(slash.headers()['location']).toBe(`/cv/${publishedId}`);

    const extra = await request.get(webUrl(`/cv/${publishedId}/x`));
    expect(extra.status()).toBe(HTTP.NOT_FOUND);
    expect(extra.headers()['x-robots-tag']).toBe(NO_INDEX_HEADER);
  });

  test('the page HTML holds no other CV id and the draft id is a 404', async ({ request }) => {
    const html = await (await request.get(webUrl(`/cv/${publishedId}`))).text();
    expect(html).not.toContain(draftId);
    expect((await request.get(webUrl(`/cv/${draftId}`))).status()).toBe(HTTP.NOT_FOUND);
  });

  test('signed out, the BFF answers 401 for every id and 404 without an id', async ({
    request,
  }) => {
    for (const id of [publishedId, UNKNOWN_DOCUMENT_ID, MALFORMED_DOCUMENT_ID]) {
      const response = await request.get(webUrl(`${BFF_PATHS.CV}/${id}`));
      expect(response.status(), id).toBe(HTTP.UNAUTHORIZED);
      expect(((await response.json()) as { errorCode: string }).errorCode).toBe(
        BFF_SESSION_REQUIRED_CODE,
      );
    }
    expect((await request.get(webUrl(BFF_PATHS.CV))).status()).toBe(HTTP.NOT_FOUND);
  });

  test('a reader session refetches through /api/v1/cv/<id> and the BFF answers 404 alike for bad ids', async ({
    page,
  }) => {
    const bffCalls: string[] = [];
    page.on('request', (req) => {
      const { pathname } = new URL(req.url());
      if (pathname.startsWith(BFF_PATHS.CV)) bffCalls.push(pathname);
    });
    await page.goto(webUrl(`/cv/${publishedId}`));
    await page.getByRole('button', { name: WEB_COPY.session.signIn, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: WEB_COPY.login.emailLabel }).fill(e2eEnv.readerEmail);
    await dialog.getByLabel(WEB_COPY.login.passwordLabel).fill(e2eEnv.readerPassword);
    await expect(dialog.locator('input[name="cf-turnstile-response"]')).not.toHaveValue('');
    await clickAfterHumanCheck(dialog.getByRole('button', { name: WEB_COPY.login.submit }));
    await expect(page.getByRole('button', { name: WEB_COPY.session.signOut })).toBeVisible();
    await expect.poll(() => bffCalls.length).toBeGreaterThan(0);
    expect(new Set(bffCalls)).toEqual(new Set([`${BFF_PATHS.CV}/${publishedId}`]));
    expect(page.url()).toBe(webUrl(`/cv/${publishedId}`));

    const api = page.context().request;
    const bodies: string[] = [];
    for (const id of [MALFORMED_DOCUMENT_ID, UNKNOWN_DOCUMENT_ID, draftId]) {
      const response = await api.get(webUrl(`${BFF_PATHS.CV}/${id}`));
      expect(response.status(), id).toBe(HTTP.NOT_FOUND);
      const text = await response.text();
      expect(text).toContain(BFF_NOT_FOUND_CODE);
      expect(text).not.toContain(id);
      bodies.push(text);
    }
    expect(new Set(bodies).size).toBe(1);
    expect((await api.get(webUrl(`${BFF_PATHS.CV}/${publishedId}`))).status()).toBe(HTTP.OK);
    expect((await api.get(webUrl(BFF_PATHS.CV))).status()).toBe(HTTP.NOT_FOUND);
  });
});
