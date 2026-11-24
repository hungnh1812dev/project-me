import { expect, test } from '@playwright/test';

import {
  API_ROOT_PATHS,
  apiOriginUrl,
  apiUrl,
  REMOVED_API_HEALTH_PATHS,
} from '../src/Api.endpoints';
import { HTTP } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';

const HEALTH_BODY = { status: 'ok' };
const webOrigin = new URL(e2eEnv.webUrl).origin;

/**
 * cms-api API-3: the health probes answer at the root of the cms-api origin; the old `/api/v1`
 * paths are gone, and the web origin does not serve them. Read-only requests.
 */
test.describe('health routes', { tag: ['@public-site', '@cms-api', '@web'] }, () => {
  for (const path of Object.values(API_ROOT_PATHS)) {
    test(`GET ${path} answers 200 {"status":"ok"} as JSON`, async ({ request }) => {
      const response = await request.get(apiOriginUrl(path));

      expect(response.status()).toBe(HTTP.OK);
      expect(response.headers()['content-type']).toContain('application/json');
      expect(await response.json()).toEqual(HEALTH_BODY);
    });
  }

  test('HEAD /health answers 200 with an empty body', async ({ request }) => {
    const response = await request.head(apiOriginUrl(API_ROOT_PATHS.HEALTH));

    expect(response.status()).toBe(HTTP.OK);
    expect(await response.text()).toBe('');
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

  for (const path of [API_ROOT_PATHS.HEALTH_LIVE, API_ROOT_PATHS.HEALTH_READY]) {
    test(`the web origin answers 404 for ${path}`, async ({ request }) => {
      const response = await request.get(`${webOrigin}${path}`);

      expect(response.status()).toBe(HTTP.NOT_FOUND);
    });
  }
});
