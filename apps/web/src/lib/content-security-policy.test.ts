import { describe, expect, it } from 'vitest';

import {
  buildContentSecurityPolicy,
  generateNonce,
  originOf,
} from './content-security-policy';

const NONCE = 'abc123';
const build = (apiBaseUrl: string, isDev = false) =>
  buildContentSecurityPolicy({ nonce: NONCE, apiBaseUrl, isDev });

function directive(csp: string, name: string): string {
  const found = csp.split('; ').find((d) => d.startsWith(`${name} `));
  if (found === undefined) throw new Error(`no ${name}`);
  return found;
}

describe('buildContentSecurityPolicy', () => {
  it('allows scripts by nonce and the Turnstile origin, never inline', () => {
    const script = directive(build('/api/v1'), 'script-src');
    expect(script).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' https://challenges.cloudflare.com",
    );
    expect(script).not.toContain('unsafe-inline');
    expect(script).not.toContain('unsafe-eval');
  });

  it('uses nonce styles with inline style attributes only (Q-W4)', () => {
    const csp = build('/api/v1');
    expect(directive(csp, 'style-src')).toBe("style-src 'self' 'nonce-abc123'");
    expect(directive(csp, 'style-src-attr')).toBe(
      "style-src-attr 'unsafe-inline'",
    );
  });

  it('keeps connect-src to self for a relative API base', () => {
    expect(directive(build('/api/v1'), 'connect-src')).toBe(
      "connect-src 'self'",
    );
  });

  it('adds the origin of an absolute API base URL', () => {
    expect(
      directive(build('https://api.example.com/api/v1'), 'connect-src'),
    ).toBe("connect-src 'self' https://api.example.com");
  });

  it('allows Cloudinary images, the Turnstile frame and forbids framing', () => {
    const csp = build('/api/v1');
    expect(directive(csp, 'img-src')).toContain('https://res.cloudinary.com');
    expect(directive(csp, 'frame-src')).toBe(
      'frame-src https://challenges.cloudflare.com',
    );
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
  });

  it('allows eval and websockets in development only', () => {
    const dev = build('/api/v1', true);
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev, 'connect-src')).toContain('ws:');
    expect(build('/api/v1')).not.toContain('unsafe-eval');
  });
});

describe('generateNonce', () => {
  it('returns a different base64 value each call', () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(generateNonce()).not.toBe(a);
  });
});

describe('originOf', () => {
  it('returns null for paths and non-http schemes', () => {
    expect(originOf('/api/v1')).toBeNull();
    expect(originOf('javascript:alert(1)')).toBeNull();
    expect(originOf('http://localhost:3000/api/v1')).toBe(
      'http://localhost:3000',
    );
  });
});
