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

  it('skips the crawler files and the favicon and keeps pages and unknown paths', () => {
    const source = config.matcher[0]?.source ?? '';
    const matches = new RegExp(`^${source}$`);
    for (const skipped of ['/robots.txt', '/sitemap.xml', '/favicon.ico']) {
      expect(matches.test(skipped)).toBe(false);
    }
    for (const kept of ['/', '/status', '/cv', '/no-such-page', '/robots.txt/x']) {
      expect(matches.test(kept)).toBe(true);
    }
  });
});
