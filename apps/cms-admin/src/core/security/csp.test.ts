import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy } from './csp';

describe('buildContentSecurityPolicy', () => {
  it('returns the self-only policy when both origins are empty', () => {
    expect(buildContentSecurityPolicy({ apiOrigin: '', imgOrigins: '' })).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; " +
        "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; " +
        "form-action 'self'; frame-ancestors 'none'",
    );
  });

  it('adds the API origin to img-src and connect-src', () => {
    expect(
      buildContentSecurityPolicy({ apiOrigin: 'https://api.example.test', imgOrigins: '' }),
    ).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; " +
        "img-src 'self' data: blob: https://api.example.test; font-src 'self'; " +
        "connect-src 'self' https://api.example.test; object-src 'none'; base-uri 'self'; " +
        "form-action 'self'; frame-ancestors 'none'",
    );
  });

  it('adds every image origin to img-src only, after the API origin', () => {
    expect(
      buildContentSecurityPolicy({
        apiOrigin: 'http://localhost:8080',
        imgOrigins: 'https://cdn.example.test  https://media.example.test',
      }),
    ).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; " +
        "img-src 'self' data: blob: http://localhost:8080 https://cdn.example.test https://media.example.test; " +
        "font-src 'self'; connect-src 'self' http://localhost:8080; object-src 'none'; " +
        "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
  });

  it('treats whitespace-only origins as empty', () => {
    expect(buildContentSecurityPolicy({ apiOrigin: '  ', imgOrigins: ' \t ' })).toBe(
      buildContentSecurityPolicy({ apiOrigin: '', imgOrigins: '' }),
    );
  });

  it.each([
    'https://api.example.test/',
    'https://api.example.test/api/v1',
    'https://api.example.test?x=1',
    'https://api.example.test#x',
    "https://api.example.test; script-src 'unsafe-inline'",
    "'unsafe-inline'",
    '"https://api.example.test"',
    'ftp://api.example.test',
    'javascript:alert(1)',
    'data:',
    'api.example.test',
    'https://user:pass@api.example.test',
    'not a url',
  ])('throws when the API origin is not a bare http(s) origin: %s', (apiOrigin) => {
    expect(() => buildContentSecurityPolicy({ apiOrigin, imgOrigins: '' })).toThrow(
      /bare http\(s\) origin/,
    );
  });

  it('throws when the API origin holds more than one origin', () => {
    expect(() =>
      buildContentSecurityPolicy({
        apiOrigin: 'https://api.example.test https://other.example.test',
        imgOrigins: '',
      }),
    ).toThrow(/single origin/);
  });

  it('throws when any image origin is not a bare http(s) origin', () => {
    expect(() =>
      buildContentSecurityPolicy({
        apiOrigin: '',
        imgOrigins: 'https://cdn.example.test https://evil.example.test/x.png',
      }),
    ).toThrow(/bare http\(s\) origin/);
  });
});
