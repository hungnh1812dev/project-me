import { describe, expect, it } from 'vitest';

import { defaultImageSrc, filterMedia, formatBytes, resolveMedia, type MediaFile } from './media';

interface Asset {
  key: string;
  name: string;
}

const CAT: Asset = { key: 'media-cat', name: 'cat.png' };
const DOG: Asset = { key: 'media-dog', name: 'Dog Photo.jpg' };

const describeAsset = (asset: Asset): MediaFile => ({
  id: asset.key,
  fileName: asset.name,
  url: `https://cdn.example.com/${asset.key}`,
});

describe('resolveMedia', () => {
  it.each([null, undefined, '', '   '])('reads %j as empty', (value) => {
    expect(resolveMedia<Asset>(value, [CAT], describeAsset)).toEqual({ status: 'empty' });
  });

  it('finds an asset as it is, even without a list', () => {
    expect(resolveMedia(CAT, undefined, describeAsset)).toEqual({ status: 'found', asset: CAT });
  });

  it('looks a trimmed id up through describe', () => {
    expect(resolveMedia<Asset>(' media-dog ', [CAT, DOG], describeAsset)).toEqual({
      status: 'found',
      asset: DOG,
    });
  });

  it('is missing when the list lacks the id or is not loaded', () => {
    expect(resolveMedia<Asset>('media-404', [CAT], describeAsset)).toEqual({
      status: 'missing',
      id: 'media-404',
    });
    expect(resolveMedia<Asset>('media-cat', undefined, describeAsset)).toEqual({
      status: 'missing',
      id: 'media-cat',
    });
  });
});

describe('filterMedia', () => {
  it('keeps every asset for a blank query, as a copy', () => {
    const items = [CAT, DOG];
    const result = filterMedia(items, '  ', describeAsset);

    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });

  it('matches the file name, ignoring case and surrounding spaces', () => {
    expect(filterMedia([CAT, DOG], ' dog PHOTO ', describeAsset)).toEqual([DOG]);
    expect(filterMedia([CAT, DOG], 'media', describeAsset)).toEqual([]);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [20480, '20 KB'],
    [1536, '1.5 KB'],
    [1258291, '1.2 MB'],
    [5 * 1024 ** 3, '5 GB'],
    [3 * 1024 ** 4, '3072 GB'],
  ])('formats %d as %s', (bytes, label) => {
    expect(formatBytes(bytes)).toBe(label);
  });
});

describe('defaultImageSrc', () => {
  const PAGE = 'http://localhost:5173';

  it.each(['https://cdn.example.com/a.png', 'http://localhost:5173/uploads/a.png'])(
    'accepts %s',
    (url) => {
      expect(defaultImageSrc(url, PAGE)).toBe(url);
    },
  );

  it.each([
    undefined,
    '',
    '/uploads/a.png',
    '//cdn.example.com/a.png',
    'http://evil.example.com/a.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
  ])('refuses %j', (url) => {
    expect(defaultImageSrc(url, PAGE)).toBeNull();
  });
});
