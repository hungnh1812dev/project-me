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
  storedFileNameOf,
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
    expect(allowedMediaTypeOf('image/png')).toMatchObject({ kind: 'image' });
    expect(allowedMediaTypeOf('video/mp4')).toMatchObject({ kind: 'video' });
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

describe('storedFileNameOf', () => {
  const sha = 'a1b2c3d4e5f60708'.repeat(4);

  it.each([
    ['Photo.JPG', 'image/jpeg', 'Photo_a1b2c3d4.jpg'],
    ['photo.jpeg', 'image/jpeg', 'photo_a1b2c3d4.jpeg'],
    ['scan', 'application/pdf', 'scan_a1b2c3d4.pdf'],
    ['fake.png', 'image/jpeg', 'fake_a1b2c3d4.jpg'],
    ['.hidden', 'image/png', '.hidden_a1b2c3d4.png'],
    ['a.b.c.mp4', 'video/mp4', 'a.b.c_a1b2c3d4.mp4'],
  ] as const)('names %s (%s) as %s', (original, mime, expected) => {
    expect(storedFileNameOf(original, sha, mime)).toBe(expected);
  });

  it('keeps a stem already ending in the hash of the same bytes', () => {
    expect(storedFileNameOf('x_a1b2c3d4.jpg', sha, 'image/jpeg')).toBe('x_a1b2c3d4.jpg');
    expect(storedFileNameOf('x_deadbeef.jpg', sha, 'image/jpeg')).toBe('x_deadbeef_a1b2c3d4.jpg');
  });

  it('cuts a 300-character stem so the whole suffix fits 255 characters', () => {
    const name = storedFileNameOf(`${'s'.repeat(300)}.jpg`, sha, 'image/jpeg');
    expect(Array.from(name)).toHaveLength(FILE_NAME_MAX_LENGTH);
    expect(name.endsWith('_a1b2c3d4.jpg')).toBe(true);
  });

  it('uses the fallback name when the original is unusable', () => {
    expect(storedFileNameOf('', sha, 'image/png')).toBe(`${FALLBACK_FILE_NAME}_a1b2c3d4.png`);
  });
});
