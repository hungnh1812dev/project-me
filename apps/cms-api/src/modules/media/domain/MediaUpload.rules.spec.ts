import { FALLBACK_FILE_NAME, FILE_NAME_MAX_LENGTH } from './Media.constants';
import {
  allowedMediaTypeOf,
  escapeLikePattern,
  isAltWithinLimit,
  isSameMediaFamily,
  MEDIA_MIME_FILTERS,
  mimeTypesOfFilter,
  normalizeAlt,
  sanitizeFileName,
  sha256Hex,
} from './MediaUpload.rules';

describe('sanitizeFileName', () => {
  it.each([
    ['photo.jpg', 'photo.jpg'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\cv.pdf', 'cv.pdf'],
    ['a\u0000b\nc.png', 'abc.png'],
    ['', FALLBACK_FILE_NAME],
    ['..', FALLBACK_FILE_NAME],
    ['dir/', FALLBACK_FILE_NAME],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it('bounds the length', () => {
    expect(Array.from(sanitizeFileName('x'.repeat(1_000))).length).toBe(FILE_NAME_MAX_LENGTH);
  });
});

describe('alt text', () => {
  it('trims, and clears a blank text', () => {
    expect(normalizeAlt('  A red box ')).toBe('A red box');
    expect(normalizeAlt('   ')).toBeNull();
    expect(normalizeAlt('')).toBeNull();
  });

  it('counts characters, not UTF-16 units', () => {
    expect(isAltWithinLimit('😀'.repeat(500))).toBe(true);
    expect(isAltWithinLimit('😀'.repeat(501))).toBe(false);
  });
});

describe('allowedMediaTypeOf', () => {
  it('knows the allowlisted types and their kind', () => {
    expect(allowedMediaTypeOf('image/png')).toEqual({ kind: 'image' });
    expect(allowedMediaTypeOf('video/mp4')).toEqual({ kind: 'video' });
  });

  it.each(['image/svg+xml', 'text/html', '__proto__', 'constructor'])('refuses %s', (mime) => {
    expect(allowedMediaTypeOf(mime)).toBeUndefined();
  });
});

describe('sha256Hex', () => {
  it('hashes bytes to lowercase hex', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('media list filters', () => {
  it('maps an exact type and each family to allowlisted types', () => {
    expect(mimeTypesOfFilter('application/pdf')).toEqual(['application/pdf']);
    expect(mimeTypesOfFilter('video/*')).toEqual(['video/mp4']);
    expect(mimeTypesOfFilter('image/*')).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
    ]);
  });

  it('accepts no type outside the allowlist and its families', () => {
    expect(MEDIA_MIME_FILTERS).not.toContain('text/html');
    expect(MEDIA_MIME_FILTERS).not.toContain('image/svg+xml');
  });

  it('escapes backslash, percent and underscore', () => {
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    expect(escapeLikePattern('plain')).toBe('plain');
  });
});

describe('isSameMediaFamily', () => {
  it('matches types of one kind only', () => {
    expect(isSameMediaFamily('image/jpeg', 'image/webp')).toBe(true);
    expect(isSameMediaFamily('application/pdf', 'application/pdf')).toBe(true);
    expect(isSameMediaFamily('image/png', 'application/pdf')).toBe(false);
    expect(isSameMediaFamily('video/mp4', 'image/png')).toBe(false);
    expect(isSameMediaFamily('image/svg+xml', 'image/svg+xml')).toBe(false);
  });
});
