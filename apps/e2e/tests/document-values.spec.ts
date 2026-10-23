import { type APIRequestContext, expect, test } from '@playwright/test';

import { e2eEnv } from '../src/env';

const CV_SLUG = 'cv-page';
const DOCUMENTS_PATH = `/documents/${CV_SLUG}`;
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const RUN_ID = Date.now().toString(36);
const POSITION = `E2E values ${RUN_ID}`;
const SAFE_TEXT = `Summary ${RUN_ID}`;
const DIRTY_RICHTEXT = `<p>${SAFE_TEXT}</p><img src=x onerror="alert(1)"><script>alert(2)</script>`;

const url = (path: string) => `${e2eEnv.apiBaseUrl}${path}`;

async function ownerHeaders(request: APIRequestContext) {
  const res = await request.post(url('/auth/login'), {
    data: { email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword },
  });
  expect(res.status()).toBe(HTTP_OK);
  const { accessToken } = (await res.json()) as { accessToken: string };
  return { Authorization: `Bearer ${accessToken}` };
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
    const created = await request.post(url(DOCUMENTS_PATH), {
      headers,
      data: { values: { position: POSITION, summary: DIRTY_RICHTEXT } },
    });
    expect(created.status()).toBe(HTTP_CREATED);
    const body = (await created.json()) as { documentId: string };

    const read = await request.get(
      url(`${DOCUMENTS_PATH}/${body.documentId}?status=draft`),
      { headers },
    );
    expect(read.status()).toBe(HTTP_OK);
    const text = await read.text();
    expect(text).toContain(SAFE_TEXT);
    expect(text).not.toContain('onerror');
    expect(text).not.toContain('<script');
  });

  test('richtext that is not a string is a 400', async ({ request }) => {
    for (const summary of [123, { html: '<p>x</p>' }, ['<p>x</p>']]) {
      const res = await request.post(url(DOCUMENTS_PATH), {
        headers,
        data: { values: { position: POSITION, summary } },
      });
      expect(res.status()).toBe(HTTP_BAD_REQUEST);
    }
  });

  test('an unparsable filter value never causes a server error', async ({
    request,
  }) => {
    for (const filter of [
      'filters[position][$gt]=%00',
      'filters[isMain]=maybe',
    ]) {
      const res = await request.get(url(`${DOCUMENTS_PATH}?${filter}`), {
        headers,
      });
      expect(res.status()).toBeLessThan(500);
    }
  });
});
