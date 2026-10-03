import { describe, expect, it } from 'vitest';

import type { MediaAsset } from '@/features/settings/types';
import { makeFieldSet } from '@/test/contentFixtures';

import {
  emptyEntry,
  emptyValues,
  NUMBER_ERROR,
  rulesFor,
  toDocumentData,
  toFormValues,
} from './schemaForm';
import type { FieldDefinition, FieldType } from './types';

const field = (name: string, type: string, extra: Partial<FieldDefinition> = {}) =>
  ({ name, type: type as FieldType, ...extra }) as FieldDefinition;

const ASSET: MediaAsset = {
  documentId: 'media-1',
  fileName: 'cover.png',
  mimeType: 'image/png',
  size: 2048,
  width: 640,
  height: 480,
  url: 'https://cdn.example.com/cover.png',
  thumbnailUrl: 'https://cdn.example.com/cover-thumb.png',
  publicId: 'cover',
  hash: 'abc',
  uploadedBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** A document holding every field of `makeFieldSet`, plus the system fields. */
const FULL_DOC = {
  documentId: 'doc-1',
  status: 'published',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  updatedBy: { documentId: 'user-1', name: 'Jane Doe' },
  publishedAt: '2026-01-02T00:00:00.000Z',
  title: 'Hello',
  slug: 'hello',
  views: 12.5,
  featured: true,
  body: '<p>Hi</p>',
  coverImage: ASSET,
  meta: { tags: ['a', 'b'], nested: { ok: true } },
  seo: { metaTitle: 'SEO', social: { handle: '@me' } },
  gallery: [
    { caption: 'One', image: 'media-2', tags: [{ label: 'x' }, { label: 'y' }] },
    { caption: 'Two', image: null, tags: [] },
  ],
  location: { lat: 1, lng: 2 },
};

describe('toFormValues (AC-6)', () => {
  it('maps an existing document to form values, nested and repeatable included', () => {
    expect(toFormValues(makeFieldSet(), FULL_DOC)).toEqual({
      title: 'Hello',
      slug: 'hello',
      views: '12.5',
      featured: true,
      body: '<p>Hi</p>',
      coverImage: ASSET,
      meta: '{\n  "tags": [\n    "a",\n    "b"\n  ],\n  "nested": {\n    "ok": true\n  }\n}',
      seo: { metaTitle: 'SEO', social: { handle: '@me' } },
      gallery: [
        { caption: 'One', image: 'media-2', tags: [{ label: 'x' }, { label: 'y' }] },
        { caption: 'Two', image: null, tags: [] },
      ],
      location: { lat: 1, lng: 2 },
    });
  });

  it('never includes a system field', () => {
    const values = toFormValues(makeFieldSet(), FULL_DOC);
    for (const key of [
      'documentId',
      'status',
      'createdAt',
      'updatedAt',
      'updatedBy',
      'publishedAt',
    ])
      expect(values).not.toHaveProperty(key);
  });

  it.each<[string, FieldDefinition, unknown, unknown]>([
    ['missing text', field('a', 'text'), undefined, ''],
    ['non-string text', field('a', 'text'), 42, ''],
    ['missing richtext', field('a', 'richtext'), null, ''],
    ['a null number', field('a', 'number'), null, ''],
    ['a non-finite number', field('a', 'number'), Number.NaN, ''],
    ['a numeric string', field('a', 'number'), '7', ''],
    ['zero', field('a', 'number'), 0, '0'],
    ['a missing boolean', field('a', 'boolean'), undefined, false],
    ['a truthy non-boolean', field('a', 'boolean'), 'yes', false],
    ['false', field('a', 'boolean'), false, false],
    ['a missing json value', field('a', 'json'), undefined, ''],
    ['a json null', field('a', 'json'), null, 'null'],
    ['a json string', field('a', 'json'), 'hi', '"hi"'],
    ['a media id', field('a', 'media'), 'media-9', 'media-9'],
    ['a missing media value', field('a', 'media'), undefined, null],
    ['a media number', field('a', 'media'), 5, null],
    ['an array as media', field('a', 'media'), ['x'], null],
    ['an object that is not an asset', field('a', 'media'), { url: 'x' }, null],
    ['a blank media id', field('a', 'media'), '  ', null],
    [
      'a missing component',
      field('a', 'component', { fields: [field('b', 'text')] }),
      null,
      { b: '' },
    ],
    ['a component without fields', field('a', 'component'), { b: 1 }, {}],
    [
      'an array as component',
      field('a', 'component', { fields: [field('b', 'text')] }),
      [],
      { b: '' },
    ],
    ['a missing repeatable', field('a', 'component', { repeatable: true }), undefined, []],
    [
      'a repeatable with a non-object entry',
      field('a', 'component', { repeatable: true, fields: [field('b', 'number')] }),
      [null, { b: 3 }],
      [{ b: '' }, { b: '3' }],
    ],
    ['an unknown type', field('a', 'geo'), [1, 2], [1, 2]],
    ['a missing unknown value', field('a', 'geo'), undefined, undefined],
  ])('maps %s', (_case, def, value, expected) => {
    expect(toFormValues([def], { a: value })).toEqual({ a: expected });
  });

  it('treats a missing document as empty', () => {
    expect(toFormValues([field('a', 'text')], null)).toEqual({ a: '' });
    expect(toFormValues([field('a', 'text')], undefined)).toEqual({ a: '' });
  });
});

describe('emptyValues and emptyEntry (AC-6)', () => {
  it('builds the values for a new document', () => {
    expect(emptyValues(makeFieldSet())).toEqual({
      title: '',
      slug: '',
      views: '',
      featured: false,
      body: '',
      coverImage: null,
      meta: '',
      seo: { metaTitle: '', social: { handle: '' } },
      gallery: [],
      location: undefined,
    });
  });

  it('builds a new repeatable entry from the component fields', () => {
    const gallery = makeFieldSet().find((f) => f.name === 'gallery')!;
    expect(emptyEntry(gallery.fields ?? [])).toEqual({ caption: '', image: null, tags: [] });
  });
});

describe('toDocumentData (AC-6)', () => {
  it('round-trips a document to its schema fields', () => {
    const fields = makeFieldSet();
    const { documentId, status, createdAt, updatedAt, updatedBy, publishedAt, ...schemaFields } =
      FULL_DOC;
    void [documentId, status, createdAt, updatedAt, updatedBy, publishedAt];

    expect(toDocumentData(fields, toFormValues(fields, FULL_DOC))).toEqual(schemaFields);
  });

  it('returns only schema fields, never a system field or a stray value', () => {
    const data = toDocumentData([field('title', 'text')], {
      title: 'A',
      documentId: 'x',
      status: 'draft',
      updatedBy: null,
      extra: 1,
    });
    expect(data).toEqual({ title: 'A' });
  });

  it.each<[string, FieldDefinition, unknown, unknown]>([
    ['empty number text', field('a', 'number'), '', null],
    ['blank number text', field('a', 'number'), '   ', null],
    ['number text', field('a', 'number'), ' -1.5e2 ', -150],
    ['a number value', field('a', 'number'), 3, 3],
    ['invalid number text', field('a', 'number'), 'abc', null],
    ['a missing number', field('a', 'number'), undefined, null],
    ['json text', field('a', 'json'), '{"x":[1]}', { x: [1] }],
    ['empty json text', field('a', 'json'), '  ', null],
    ['invalid json text', field('a', 'json'), '{', null],
    ['a missing json value', field('a', 'json'), undefined, null],
    ['a missing text', field('a', 'text'), undefined, ''],
    ['a non-string text', field('a', 'richtext'), 5, ''],
    ['a boolean', field('a', 'boolean'), true, true],
    ['a missing boolean', field('a', 'boolean'), undefined, false],
    ['a media asset', field('a', 'media'), ASSET, ASSET],
    ['a media id', field('a', 'media'), 'media-1', 'media-1'],
    ['a missing media value', field('a', 'media'), undefined, null],
    ['a media number', field('a', 'media'), 5, null],
    ['a media object that is not an asset', field('a', 'media'), { url: 'x' }, null],
    ['an empty media id', field('a', 'media'), '', null],
    [
      'a missing component',
      field('a', 'component', { fields: [field('b', 'number')] }),
      undefined,
      { b: null },
    ],
    ['a missing repeatable', field('a', 'component', { repeatable: true }), 'x', []],
    ['an unknown value, unchanged', field('a', 'geo'), { lat: 1 }, { lat: 1 }],
  ])('maps %s', (_case, def, value, expected) => {
    expect(toDocumentData([def], { a: value })).toEqual({ a: expected });
  });

  it('keeps the order of repeatable entries', () => {
    const def = field('items', 'component', { repeatable: true, fields: [field('n', 'number')] });
    expect(toDocumentData([def], { items: [{ n: '2' }, { n: '1' }] })).toEqual({
      items: [{ n: 2 }, { n: 1 }],
    });
  });
});

describe('rulesFor (AC-8)', () => {
  const validate = (def: FieldDefinition, value: unknown) => rulesFor(def).validate?.(value);

  it.each<[string, unknown]>([
    ['empty text', ''],
    ['an integer', '42'],
    ['a negative decimal', '-0.5'],
    ['a leading dot', '.5'],
    ['an exponent', '1e3'],
    ['padded text', ' 7 '],
    ['a number value', 7],
    ['a missing value', undefined],
  ])('accepts %s as a number', (_case, value) => {
    expect(validate(field('n', 'number'), value)).toBe(true);
  });

  it.each<[string, string]>([
    ['letters', 'abc'],
    ['a trailing letter', '12a'],
    ['hex', '0x10'],
    ['Infinity', 'Infinity'],
    ['two dots', '1.2.3'],
    ['a lone sign', '-'],
  ])('rejects %s with "Enter a number."', (_case, value) => {
    expect(validate(field('n', 'number'), value)).toBe(NUMBER_ERROR);
  });

  it('rejects an overflowing number', () => {
    expect(validate(field('n', 'number'), '1e400')).toBe(NUMBER_ERROR);
  });

  it('accepts empty or valid json text and missing values', () => {
    expect(validate(field('j', 'json'), '')).toBe(true);
    expect(validate(field('j', 'json'), '[1, "a"]')).toBe(true);
    expect(validate(field('j', 'json'), undefined)).toBe(true);
  });

  it('rejects invalid json text with its parse error', () => {
    expect(validate(field('j', 'json'), '{"a":')).toMatch(/^Invalid JSON: /);
  });

  it.each(['text', 'richtext', 'boolean', 'media', 'component', 'geo'])(
    'has no rules for a %s field',
    (type) => {
      expect(rulesFor(field('x', type))).toEqual({});
    },
  );
});
