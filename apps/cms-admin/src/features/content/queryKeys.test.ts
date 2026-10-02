import { describe, expect, it } from 'vitest';

import { contentKeys } from './queryKeys';

function isPrefix(prefix: readonly unknown[], key: readonly unknown[]): boolean {
  return prefix.length <= key.length && prefix.every((part, i) => Object.is(part, key[i]));
}

describe('contentKeys (AC-7)', () => {
  it('produces the keys in the spec table', () => {
    expect(contentKeys.all).toEqual(['content']);
    expect(contentKeys.types()).toEqual(['content', 'types']);
    expect(contentKeys.typeList()).toEqual(['content', 'types', 'list']);
    expect(contentKeys.type('article')).toEqual(['content', 'types', 'detail', 'article']);
    expect(contentKeys.documents('article')).toEqual(['content', 'documents', 'article']);
    expect(contentKeys.single('home')).toEqual(['content', 'documents', 'home', 'single']);
    expect(contentKeys.lists('article')).toEqual(['content', 'documents', 'article', 'list']);
    expect(contentKeys.list('article', { start: 20, search: ' hi ' })).toEqual([
      'content',
      'documents',
      'article',
      'list',
      { start: 20, search: 'hi' },
    ]);
    expect(contentKeys.detail('article', 'doc-1')).toEqual([
      'content',
      'documents',
      'article',
      'detail',
      'doc-1',
    ]);
  });

  it('embeds the normalized params, so equal params share one key', () => {
    expect(contentKeys.list('article', {})).toEqual(
      contentKeys.list('article', { start: 0, size: 20, search: '  ', filters: {} }),
    );
    expect(
      JSON.stringify(contentKeys.list('article', { filters: { b: { $eq: 1 }, a: { $eq: 2 } } })),
    ).toBe(
      JSON.stringify(contentKeys.list('article', { filters: { a: { $eq: 2 }, b: { $eq: 1 } } })),
    );
  });

  it('gives different params different keys', () => {
    expect(contentKeys.list('article', { start: 20 })).not.toEqual(
      contentKeys.list('article', { start: 40 }),
    );
  });

  it('makes lists(slug) a prefix of every list(slug, params)', () => {
    for (const params of [{}, { start: 20 }, { filters: { title: { $eq: 'x' } } }]) {
      expect(isPrefix(contentKeys.lists('article'), contentKeys.list('article', params))).toBe(
        true,
      );
    }
  });

  it('makes documents(slug) a prefix of every document key for that slug', () => {
    const prefix = contentKeys.documents('article');

    for (const key of [
      contentKeys.single('article'),
      contentKeys.lists('article'),
      contentKeys.list('article', { start: 20 }),
      contentKeys.detail('article', 'doc-1'),
    ]) {
      expect(isPrefix(prefix, key)).toBe(true);
    }
  });

  it('makes documents(slug) a prefix of no key for another slug', () => {
    const prefix = contentKeys.documents('article');

    for (const key of [
      contentKeys.documents('articles'),
      contentKeys.single('news'),
      contentKeys.lists('news'),
      contentKeys.list('news', {}),
      contentKeys.detail('news', 'article'),
      contentKeys.type('article'),
    ]) {
      expect(isPrefix(prefix, key)).toBe(false);
    }
  });

  it('starts every key with the content root', () => {
    for (const key of [
      contentKeys.types(),
      contentKeys.typeList(),
      contentKeys.type('a'),
      contentKeys.documents('a'),
      contentKeys.single('a'),
      contentKeys.lists('a'),
      contentKeys.list('a', {}),
      contentKeys.detail('a', 'b'),
    ]) {
      expect(isPrefix(contentKeys.all, key)).toBe(true);
    }
  });

  it('nests typeList and type under types', () => {
    expect(isPrefix(contentKeys.types(), contentKeys.typeList())).toBe(true);
    expect(isPrefix(contentKeys.types(), contentKeys.type('article'))).toBe(true);
  });

  it('types the keys as readonly tuples', () => {
    const key = contentKeys.detail('article', 'doc-1');
    const tag: 'detail' = key[3];
    // @ts-expect-error readonly tuple
    key[0] = 'other';

    expect(tag).toBe('detail');
  });
});
