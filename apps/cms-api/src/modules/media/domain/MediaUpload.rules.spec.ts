import { FALLBACK_FILE_NAME, FILE_NAME_MAX_LENGTH } from './Media.constants';
import {
  allowedMediaTypeOf,
  isAltWithinLimit,
  normalizeAlt,
  sanitizeFileName,
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
    expect(Array.from(sanitizeFileName('x'.repeat(1_000))).length).toBe(
      FILE_NAME_MAX_LENGTH,
    );
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

  it.each(['image/svg+xml', 'text/html', '__proto__', 'constructor'])(
    'refuses %s',
    (mime) => {
      expect(allowedMediaTypeOf(mime)).toBeUndefined();
    },
  );
});
