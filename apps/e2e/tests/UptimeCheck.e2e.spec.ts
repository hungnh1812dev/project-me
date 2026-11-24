import { expect, test } from '@playwright/test';

import { BFF_PATHS, HEALTH_OTHER_PATH, HEALTH_PATHS } from '../src/Api.endpoints';
import { HTTP } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';

const UPTIME_PATH = HEALTH_PATHS.UPTIME;
const UPTIME_BODY = { status: 'ok' };
const NO_STORE = 'no-store';
const NONCE_CSP_MARKER = "'nonce-";
const CRAWLER_FILE_PATHS = ['/sitemap.xml', '/robots.txt'];

const webOrigin = new URL(e2eEnv.webUrl).origin;

/**
 * public-site PS-8: the uptime check answers from the web server alone, uncached and outside the nonce CSP.
 * Read-only requests, no state changes.
 */
test.describe('uptime check', { tag: ['@public-site', '@web'] }, () => {
  test('GET /health answers 200 {"status":"ok"} as JSON, uncached', async ({ request }) => {
    const response = await request.get(`${webOrigin}${UPTIME_PATH}`);

    expect(response.status()).toBe(HTTP.OK);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['cache-control']).toBe(NO_STORE);
    expect(response.headers()['content-security-policy'] ?? '').not.toContain(NONCE_CSP_MARKER);
    expect(await response.json()).toEqual(UPTIME_BODY);
  });

  test('HEAD /health answers 200 with an empty body', async ({ request }) => {
    const response = await request.head(`${webOrigin}${UPTIME_PATH}`);

    expect(response.status()).toBe(HTTP.OK);
    expect(await response.text()).toBe('');
  });

  test('a path under /health other than live and ready is a 404', async ({ request }) => {
    const response = await request.get(`${webOrigin}${HEALTH_OTHER_PATH}`);

    expect(response.status()).toBe(HTTP.NOT_FOUND);
  });

  for (const path of [HEALTH_PATHS.LIVE, HEALTH_PATHS.READY]) {
    test(`dev stack: GET and HEAD ${path} answer 200 {"status":"ok"}, uncached, outside the nonce CSP`, async ({
      request,
    }) => {
      test.skip(!e2eEnv.isDevStack, 'the full stack closes this path at the proxy (HealthRoutes)');

      const get = await request.get(`${webOrigin}${path}`);
      expect(get.status()).toBe(HTTP.OK);
      expect(get.headers()['content-type']).toContain('application/json');
      expect(get.headers()['cache-control']).toBe(NO_STORE);
      expect(get.headers()['content-security-policy'] ?? '').not.toContain(NONCE_CSP_MARKER);
      expect(await get.json()).toEqual(UPTIME_BODY);

      const head = await request.head(`${webOrigin}${path}`);
      expect(head.status()).toBe(HTTP.OK);
      expect(await head.text()).toBe('');
    });
  }

  test('the crawler files do not list /health', async ({ request }) => {
    for (const path of CRAWLER_FILE_PATHS) {
      const response = await request.get(`${webOrigin}${path}`);

      expect(response.status()).toBe(HTTP.OK);
      expect(await response.text()).not.toContain(UPTIME_PATH);
    }
  });

  test('GET /api/v1/health is still served by its own BFF route', async ({ request }) => {
    const response = await request.get(`${webOrigin}${BFF_PATHS.HEALTH}`);

    expect(response.status()).toBe(HTTP.OK);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toEqual(UPTIME_BODY);
  });
});
