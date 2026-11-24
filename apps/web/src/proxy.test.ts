import { createRequire } from 'node:module';

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { config, proxy } from './proxy';

describe('proxy', () => {
  it('sets a CSP carrying a fresh nonce on the response and the forwarded request', () => {
    const first = proxy(new NextRequest('http://localhost/'));
    const second = proxy(new NextRequest('http://localhost/'));
    const csp = first.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(second.headers.get('content-security-policy')).not.toBe(csp);
  });

  it('skips the crawler files, the favicon and the health routes and keeps pages and unknown paths', () => {
    const source = config.matcher[0]?.source ?? '';
    const matches = new RegExp(`^${source}$`);
    for (const skipped of [
      '/robots.txt',
      '/sitemap.xml',
      '/favicon.ico',
      '/health',
      '/health/live',
      '/health/ready',
    ]) {
      expect(matches.test(skipped)).toBe(false);
    }
    for (const kept of [
      '/',
      '/status',
      '/cv',
      '/no-such-page',
      '/robots.txt/x',
      '/health/x',
      '/health/other',
      '/health/live/x',
      '/healthz',
    ]) {
      expect(matches.test(kept)).toBe(true);
    }
  });

  it('passes Next.js matcher validation (no capturing groups)', () => {
    const { getMiddlewareMatchers } = createRequire(import.meta.url)(
      'next/dist/build/analysis/get-page-static-info',
    ) as {
      getMiddlewareMatchers: (matcher: unknown, nextConfig: object) => { regexp: string }[];
    };
    expect(() => getMiddlewareMatchers(config.matcher, {})).not.toThrow();
  });
});
