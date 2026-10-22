import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { proxy } from './proxy';

describe('proxy', () => {
  it('sets a CSP carrying a fresh nonce on the response and the forwarded request', () => {
    const first = proxy(new NextRequest('http://localhost/'));
    const second = proxy(new NextRequest('http://localhost/'));
    const csp = first.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(
      first.headers.get('x-middleware-request-content-security-policy'),
    ).toBe(csp);
    expect(second.headers.get('content-security-policy')).not.toBe(csp);
  });
});
