import { expect, test } from '@playwright/test';

import { HTTP } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';

const ROBOTS_PATH = '/robots.txt';
const SITEMAP_PATH = '/sitemap.xml';
const FAVICON_PATH = '/favicon.ico';
const CRAWLER_CACHE_CONTROL = 'public, max-age=3600';
const NONCE_CSP_MARKER = "'nonce-";
const SITEMAP_PAGE_PATHS = ['/', '/status'];
const ICON_CONTENT_TYPE = /^image\/(x-icon|vnd\.microsoft\.icon)/;
const SITEMAP_LOC = /<loc>([^<]+)<\/loc>/g;

const webOrigin = new URL(e2eEnv.webUrl).origin;

/**
 * public-site PS-4 (criterion 28): the crawler files of the web app and the admin host's robots.txt.
 * The robots rules follow the stack: production on the smoke stack, `Disallow: /` on the dev stack.
 * Read-only GETs, no state changes.
 */
test.describe('crawler files', { tag: ['@public-site', '@web', '@cms-admin'] }, () => {
  test('robots.txt answers 200 as text with the stack rules and the sitemap URL', async ({
    request,
  }) => {
    const response = await request.get(`${webOrigin}${ROBOTS_PATH}`);

    expect(response.status()).toBe(HTTP.OK);
    expect(response.headers()['content-type']).toContain('text/plain');
    expect(response.headers()['cache-control']).toBe(CRAWLER_CACHE_CONTROL);
    expect(response.headers()['content-security-policy'] ?? '').not.toContain(NONCE_CSP_MARKER);
    const body = await response.text();
    expect(body).toMatch(/^User-Agent: \*$/im);
    expect(body).toContain(`Sitemap: ${webOrigin}${SITEMAP_PATH}`);
    // The smoke stack runs `staging` by default and `production` with SMOKE_WEB_PRODUCTION=1.
    if (/^Allow:/m.test(body)) {
      expect(body).toMatch(/^Allow: \/$/m);
      expect(body).toMatch(/^Disallow: \/api\/$/m);
    } else {
      expect(body).toMatch(/^Disallow: \/$/m);
    }
  });

  test('sitemap.xml lists only / and /status as absolute URLs that answer 200', async ({
    request,
  }) => {
    const response = await request.get(`${webOrigin}${SITEMAP_PATH}`);

    expect(response.status()).toBe(HTTP.OK);
    expect(response.headers()['content-type']).toContain('application/xml');
    expect(response.headers()['cache-control']).toBe(CRAWLER_CACHE_CONTROL);
    expect(response.headers()['content-security-policy'] ?? '').not.toContain(NONCE_CSP_MARKER);
    const body = await response.text();
    expect(body).not.toContain('lastmod');
    const urls = [...body.matchAll(SITEMAP_LOC)].map((match) => match[1] ?? '');
    expect(urls).toEqual(SITEMAP_PAGE_PATHS.map((pagePath) => `${webOrigin}${pagePath}`));
    for (const url of urls) {
      expect((await request.get(url)).status()).toBe(HTTP.OK);
    }
  });

  test('favicon.ico answers 200 as an icon without the nonce CSP', async ({ request }) => {
    const response = await request.get(`${webOrigin}${FAVICON_PATH}`);

    expect(response.status()).toBe(HTTP.OK);
    expect(response.headers()['content-type']).toMatch(ICON_CONTENT_TYPE);
    expect(response.headers()['content-security-policy'] ?? '').not.toContain(NONCE_CSP_MARKER);
  });

  test('a page and an unknown path next to the crawler files keep the nonce CSP', async ({
    request,
  }) => {
    const page = await request.get(`${webOrigin}/`);
    const unknown = await request.get(`${webOrigin}${ROBOTS_PATH}x`);

    expect(page.headers()['content-security-policy']).toContain(NONCE_CSP_MARKER);
    expect(unknown.status()).toBe(HTTP.NOT_FOUND);
    expect(unknown.headers()['content-security-policy']).toContain(NONCE_CSP_MARKER);
  });

  test('the admin host robots.txt disallows every crawler', async ({ request }) => {
    const response = await request.get(`${e2eEnv.adminUrl}${ROBOTS_PATH}`);

    expect(response.status()).toBe(HTTP.OK);
    expect(response.headers()['content-type']).toContain('text/plain');
    const lines = (await response.text())
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    expect(lines).toEqual(['User-agent: *', 'Disallow: /']);
  });
});
