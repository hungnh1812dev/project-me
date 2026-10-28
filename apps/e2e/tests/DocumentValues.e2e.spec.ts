import { type APIRequestContext, expect, test } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { HTTP, RUN_ID, CV_PAGE_SLUG } from '../src/E2e.constants';
import { bearer, ownerApiToken } from '../src/Session.fixture';

const DOCUMENTS_PATH = API_PATHS.documents(CV_PAGE_SLUG);
const POSITION = `E2E values ${RUN_ID}`;
const SAFE_TEXT = `Summary ${RUN_ID}`;
const DIRTY_RICHTEXT = `<p>${SAFE_TEXT}</p><img src=x onerror="alert(1)"><script>alert(2)</script>`;

async function ownerHeaders(request: APIRequestContext) {
  return bearer(await ownerApiToken(request));
}

test.describe.serial('API: document value coercion (R2-02)', () => {
  let headers: Record<string, string>;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    headers = await ownerHeaders(request);
    await request.dispose();
  });

  test('richtext is stored sanitized, without scripts or event attributes', async ({
    request,
  }) => {
    const created = await request.post(apiUrl(DOCUMENTS_PATH), {
      headers,
      data: { values: { position: POSITION, summary: DIRTY_RICHTEXT } },
    });
    expect(created.status()).toBe(HTTP.CREATED);
    const body = (await created.json()) as { documentId: string };

    const read = await request.get(
      apiUrl(`${DOCUMENTS_PATH}/${body.documentId}?status=draft`),
      { headers },
    );
    expect(read.status()).toBe(HTTP.OK);
    const text = await read.text();
    expect(text).toContain(SAFE_TEXT);
    expect(text).not.toContain('onerror');
    expect(text).not.toContain('<script');
  });

  test('richtext that is not a string is a 400', async ({ request }) => {
    for (const summary of [123, { html: '<p>x</p>' }, ['<p>x</p>']]) {
      const response = await request.post(apiUrl(DOCUMENTS_PATH), {
        headers,
        data: { values: { position: POSITION, summary } },
      });
      expect(response.status()).toBe(HTTP.BAD_REQUEST);
    }
  });

  test('an unparsable filter value never causes a server error', async ({
    request,
  }) => {
    for (const filter of [
      'filters[position][$gt]=%00',
      'filters[isMain]=maybe',
    ]) {
      const response = await request.get(
        apiUrl(`${DOCUMENTS_PATH}?${filter}`),
        {
          headers,
        },
      );
      expect(response.status()).toBeLessThan(500);
    }
  });
});
