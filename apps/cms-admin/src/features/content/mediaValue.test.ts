import { describe, expect, it } from 'vitest';

import type { MediaAsset } from '@/features/settings/types';

import { isMediaAsset, readMediaValue, resolveMedia } from './mediaValue';

const asset = (documentId: string, fileName = `${documentId}.png`): MediaAsset => ({
  documentId,
  fileName,
  mimeType: 'image/png',
  size: 2048,
  width: 640,
  height: 480,
  url: `https://cdn.example.com/${fileName}`,
  thumbnailUrl: `https://cdn.example.com/thumb-${fileName}`,
  publicId: documentId,
  hash: 'abc',
  uploadedBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const COVER = asset('media-1', 'cover.png');
const LOGO = asset('media-2', 'logo.png');

describe('isMediaAsset', () => {
  it.each<[string, unknown, boolean]>([
    ['an asset', COVER, true],
    ['an object with a documentId and fileName', { documentId: 'm', fileName: 'a.png' }, true],
    ['an object without a documentId', { fileName: 'a.png' }, false],
    ['an empty documentId', { documentId: '', fileName: 'a.png' }, false],
    ['a numeric documentId', { documentId: 1, fileName: 'a.png' }, false],
    ['a missing fileName', { documentId: 'm' }, false],
    ['an array', [COVER], false],
    ['a string', 'media-1', false],
    ['null', null, false],
  ])('%s -> %s', (_case, value, expected) => {
    expect(isMediaAsset(value)).toBe(expected);
  });
});

describe('readMediaValue (D4)', () => {
  it.each<[string, unknown, unknown]>([
    ['an asset object, unchanged', COVER, COVER],
    ['an asset with extra keys, unchanged', { ...COVER, alt: 'x' }, { ...COVER, alt: 'x' }],
    ['a documentId string', 'media-9', 'media-9'],
    ['a documentId with spaces around it', '  media-9 ', 'media-9'],
    ['an empty string', '', null],
    ['a blank string', '   ', null],
    ['undefined', undefined, null],
    ['null', null, null],
    ['a number', 5, null],
    ['an object that is not an asset', { url: 'x' }, null],
    ['an array', ['media-1'], null],
  ])('reads %s', (_case, value, expected) => {
    expect(readMediaValue(value)).toEqual(expected);
  });
});

describe('resolveMedia (D4, AC-13)', () => {
  it('is empty for no value', () => {
    expect(resolveMedia(null, [COVER])).toEqual({ status: 'empty' });
  });

  it('finds an asset object without the list', () => {
    expect(resolveMedia(COVER, undefined)).toEqual({ status: 'found', asset: COVER });
  });

  it('resolves a documentId through the list', () => {
    expect(resolveMedia('media-2', [COVER, LOGO])).toEqual({ status: 'found', asset: LOGO });
  });

  it('reports an unknown documentId as missing', () => {
    expect(resolveMedia('media-404', [COVER, LOGO])).toEqual({
      status: 'missing',
      id: 'media-404',
    });
  });

  it('reports a documentId as missing while the list is not cached', () => {
    expect(resolveMedia('media-1', undefined)).toEqual({ status: 'missing', id: 'media-1' });
  });

  it('reads the raw value first', () => {
    expect(resolveMedia(' media-1 ' as unknown as string, [COVER])).toEqual({
      status: 'found',
      asset: COVER,
    });
    expect(resolveMedia(42 as unknown as string, [COVER])).toEqual({ status: 'empty' });
  });
});
