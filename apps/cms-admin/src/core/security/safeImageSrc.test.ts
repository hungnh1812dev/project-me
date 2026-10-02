import { describe, expect, it } from 'vitest';

import { safeImageSrc } from './safeImageSrc';

const ORIGINS = { apiOrigin: 'http://localhost:8080', pageOrigin: 'http://localhost:5173' };

describe('safeImageSrc (P4-SEC-2, AC-17)', () => {
  it('returns an absolute https URL on any host unchanged', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/c_fill/cat.png';
    expect(safeImageSrc(url, ORIGINS)).toBe(url);
  });

  it('returns an http URL on the API origin (the dev backend, D3)', () => {
    const url = 'http://localhost:8080/uploads/cat.png';
    expect(safeImageSrc(url, ORIGINS)).toBe(url);
  });

  it('returns an http URL on the page origin', () => {
    const url = 'http://localhost:5173/media/cat.png';
    expect(safeImageSrc(url, ORIGINS)).toBe(url);
  });

  it.each([
    ['http to another host', 'http://evil.example.test/x.png'],
    ['http on the API host but another port', 'http://localhost:8081/x.png'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/png;base64,iVBORw0KGgo='],
    ['blob: on the page origin', 'blob:http://localhost:5173/0b4c1d2e-0000-4000-8000-000000000000'],
    ['protocol-relative', '//evil.example.test/x.png'],
    ['a relative path', '/media/cat.png'],
    ['an unparsable string', 'http://'],
    ['an empty string', ''],
    ['ftp:', 'ftp://files.example.test/x.png'],
  ])('returns null for %s', (_label, url) => {
    expect(safeImageSrc(url, ORIGINS)).toBeNull();
  });

  it('returns null for a missing URL', () => {
    expect(safeImageSrc(undefined, ORIGINS)).toBeNull();
    expect(safeImageSrc(null, ORIGINS)).toBeNull();
  });

  it('ignores an empty API origin instead of matching it', () => {
    expect(
      safeImageSrc('http://localhost:8080/x.png', { apiOrigin: '', pageOrigin: '' }),
    ).toBeNull();
  });

  it('never matches a URL whose origin is opaque ("null")', () => {
    expect(safeImageSrc('data:image/png,x', { apiOrigin: 'null', pageOrigin: 'null' })).toBeNull();
  });
});
