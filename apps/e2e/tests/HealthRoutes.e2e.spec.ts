import { expect, test, type APIResponse } from '@playwright/test';

import {
  API_ROOT_PATHS,
  apiOriginUrl,
  apiUrl,
  HEALTH_OTHER_PATH,
  HEALTH_PATHS,
  PROXY_CLOSED_HEALTH_PATHS,
  REMOVED_API_HEALTH_PATHS,
} from '../src/Api.endpoints';
import { HTTP } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';

const HEALTH_BODY = { status: 'ok' };
const STATUS_BODY_MARKER = '"status"';
const NO_STORE = 'no-store';
const webOrigin = new URL(e2eEnv.webUrl).origin;
const apiOrigin = new URL(e2eEnv.apiBaseUrl).origin;
const closedOrigins = [...new Set([apiOrigin, webOrigin])];

const expectNoStoreJson = (response: APIResponse): void => {
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers()['cache-control']).toBe(NO_STORE);
};

/**
 * Global RULES "Health routes", cms-api API-3: only `/health` is public. The dev stack has no proxy,
 * so there every app answers all three paths; the full stack closes `/health/live` and
 * `/health/ready` at the proxy (403, never an app answer). Read-only requests.
 */
test.describe('health routes', { tag: ['@public-site', '@cms-api', '@web'] }, () => {
  test(`GET ${HEALTH_PATHS.UPTIME} on the cms-api origin answers 200 {"status":"ok"}, uncached`, async ({
    request,
  }) => {
    const response = await request.get(apiOriginUrl(API_ROOT_PATHS.HEALTH));

    expect(response.status()).toBe(HTTP.OK);
    expectNoStoreJson(response);
    expect(await response.json()).toEqual(HEALTH_BODY);
  });

  test(`HEAD ${HEALTH_PATHS.UPTIME} on the cms-api origin answers 200, uncached, empty body`, async ({
    request,
  }) => {
    const response = await request.head(apiOriginUrl(API_ROOT_PATHS.HEALTH));

    expect(response.status()).toBe(HTTP.OK);
    expect(response.headers()['cache-control']).toBe(NO_STORE);
    expect(await response.text()).toBe('');
  });

  for (const path of [HEALTH_PATHS.LIVE, HEALTH_PATHS.READY]) {
    test(`dev stack: GET and HEAD ${path} answer 200 from cms-api, uncached`, async ({
      request,
    }) => {
      test.skip(!e2eEnv.isDevStack, 'the full stack closes this path at the proxy (next test)');

      const get = await request.get(apiOriginUrl(path));
      expect(get.status()).toBe(HTTP.OK);
      expectNoStoreJson(get);
      expect(await get.json()).toEqual(HEALTH_BODY);

      const head = await request.head(apiOriginUrl(path));
      expect(head.status()).toBe(HTTP.OK);
      expect(head.headers()['cache-control']).toBe(NO_STORE);
    });
  }

  for (const origin of closedOrigins) {
    for (const path of PROXY_CLOSED_HEALTH_PATHS) {
      test(`full stack: ${origin}${path} answers the proxy's 403, no status body`, async ({
        request,
      }) => {
        test.skip(e2eEnv.isDevStack, 'the dev stack has no proxy to close the path');

        const response = await request.get(`${origin}${path}`, { maxRedirects: 0 });

        expect(response.status()).toBe(HTTP.FORBIDDEN);
        expect(await response.text()).not.toContain(STATUS_BODY_MARKER);
      });
    }
  }

  test(`${HEALTH_OTHER_PATH} on the cms-api origin answers 404`, async ({ request }) => {
    const response = await request.get(apiOriginUrl(HEALTH_OTHER_PATH));

    expect(response.status()).toBe(HTTP.NOT_FOUND);
  });

  for (const path of Object.values(REMOVED_API_HEALTH_PATHS)) {
    test(`the removed ${path} under the API prefix answers 404 with an errorCode`, async ({
      request,
    }) => {
      const response = await request.get(apiUrl(path));

      expect(response.status()).toBe(HTTP.NOT_FOUND);
      const body = (await response.json()) as { errorCode?: unknown };
      expect(typeof body.errorCode).toBe('string');
    });
  }
});
