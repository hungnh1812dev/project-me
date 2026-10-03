import { describe, expect, it } from 'vitest';

import { makeContentType, makeFieldSet, makeListedItem } from '@/test/contentFixtures';

import {
  buildColumnCatalog,
  cellValue,
  entryLabeler,
  formatCell,
  validateListParamsForType,
  type ColumnCatalog,
} from './columns';
import type { FieldDefinition, FieldType, ListParams } from './types';

const FIELDS: FieldDefinition[] = [
  { name: 'title', type: 'text', header: true },
  { name: 'views', type: 'number' },
  { name: 'featured', type: 'boolean' },
  { name: 'body', type: 'richtext' },
  { name: 'cover', type: 'media' },
  { name: 'meta', type: 'json' },
  { name: 'seo', type: 'component', fields: [{ name: 'metaTitle', type: 'text' }] },
  { name: 'gallery', type: 'component', repeatable: true, fields: [] },
  { name: 'geo', type: 'geo' as FieldType },
];

const catalog: ColumnCatalog = buildColumnCatalog(makeContentType({ fields: FIELDS }));

describe('buildColumnCatalog (AC-1)', () => {
  it('lists the sortable columns: id, the timestamps, and text/number/boolean fields', () => {
    expect(catalog.sortable).toEqual([
      'id',
      'createdAt',
      'updatedAt',
      'publishedAt',
      'title',
      'views',
      'featured',
    ]);
  });

  it('lists the filterable columns with their operators, without status (D7)', () => {
    expect(catalog.filterable).toEqual({
      id: ['$eq', '$ne'],
      documentId: ['$eq', '$ne'],
      createdAt: ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte'],
      updatedAt: ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte'],
      publishedAt: ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte'],
      title: ['$eq', '$ne', '$contains'],
      views: ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte'],
      featured: ['$eq', '$ne'],
    });
    expect(Object.hasOwn(catalog.filterable, 'status')).toBe(false);
  });

  it('lists the listable columns: every system column and text/number/boolean fields', () => {
    expect(catalog.listable).toEqual([
      'id',
      'documentId',
      'status',
      'createdAt',
      'updatedAt',
      'publishedAt',
      'updatedBy',
      'title',
      'views',
      'featured',
    ]);
  });

  it('describes each column with a label and a kind', () => {
    expect(catalog.byKey.get('createdAt')).toMatchObject({
      key: 'createdAt',
      label: 'Created',
      kind: 'date',
      system: true,
    });
    expect(catalog.byKey.get('updatedBy')).toMatchObject({
      label: 'Updated by',
      kind: 'updatedBy',
    });
    expect(catalog.byKey.get('status')).toMatchObject({ label: 'Status', kind: 'status' });
    expect(catalog.byKey.get('id')).toMatchObject({ label: 'ID', kind: 'number' });
    expect(catalog.byKey.get('documentId')).toMatchObject({ label: 'Document ID', kind: 'text' });
    expect(catalog.byKey.get('views')).toMatchObject({
      label: 'Views',
      kind: 'number',
      system: false,
    });
    expect(catalog.byKey.get('body')).toBeUndefined();
    expect(catalog.byKey.get('geo')).toBeUndefined();
  });

  it('keeps the system column when a schema field reuses its name', () => {
    const clash = buildColumnCatalog(
      makeContentType({ fields: [{ name: 'status', type: 'text' }] }),
    );
    expect(clash.byKey.get('status')).toMatchObject({ kind: 'status', system: true });
    expect(clash.listable.filter((key) => key === 'status')).toHaveLength(1);
  });

  it('covers every field kind of the shared field set', () => {
    const full = buildColumnCatalog(makeContentType({ fields: makeFieldSet() }));
    expect(full.listable.every((key) => full.byKey.has(key))).toBe(true);
  });
});

describe('validateListParamsForType (AC-2)', () => {
  it.each<[string, ListParams]>([
    ['empty params', {}],
    ['a system orderBy', { orderBy: 'createdAt', sortDir: 'asc' }],
    ['a text orderBy', { orderBy: 'title' }],
    ['a number orderBy', { orderBy: 'views' }],
    ['a boolean orderBy', { orderBy: 'featured' }],
    ['the default orderBy', { orderBy: 'id' }],
    [
      'allowed filters',
      {
        filters: {
          title: { $contains: 'a' },
          views: { $gte: 3 },
          featured: { $eq: true },
          createdAt: { $lt: '2026-01-01' },
          documentId: { $ne: 'doc-1' },
          id: { $eq: 1 },
        },
      },
    ],
    ['an undefined operator value', { filters: { body: { $eq: undefined } } }],
  ])('accepts %s', (_case, params) => {
    expect(validateListParamsForType(params, catalog)).toEqual([]);
  });

  it.each<[string, ListParams, string]>([
    ['a richtext orderBy', { orderBy: 'body' }, 'orderBy "body" is not a sortable column'],
    ['a media orderBy', { orderBy: 'cover' }, 'orderBy "cover" is not a sortable column'],
    ['a json orderBy', { orderBy: 'meta' }, 'orderBy "meta" is not a sortable column'],
    ['a component orderBy', { orderBy: 'seo' }, 'orderBy "seo" is not a sortable column'],
    ['an unknown orderBy', { orderBy: 'nope' }, 'orderBy "nope" is not a sortable column'],
    ['a status orderBy', { orderBy: 'status' }, 'orderBy "status" is not a sortable column'],
    [
      'a documentId orderBy',
      { orderBy: 'documentId' },
      'orderBy "documentId" is not a sortable column',
    ],
    [
      'a status filter (D7)',
      { filters: { status: { $eq: 'draft' } } },
      'filter "status" is not a filterable column',
    ],
    [
      'a richtext filter',
      { filters: { body: { $contains: 'x' } } },
      'filter "body" is not a filterable column',
    ],
    [
      'an unknown filter',
      { filters: { nope: { $eq: '1' } } },
      'filter "nope" is not a filterable column',
    ],
    [
      'a range operator on text',
      { filters: { title: { $gt: 'a' } } },
      'filter operator $gt is not allowed on "title"',
    ],
    [
      '$contains on a boolean',
      { filters: { featured: { $contains: 'y' } } },
      'filter operator $contains is not allowed on "featured"',
    ],
    [
      '$contains on a date',
      { filters: { createdAt: { $contains: '2026' } } },
      'filter operator $contains is not allowed on "createdAt"',
    ],
  ])('rejects %s', (_case, params, problem) => {
    expect(validateListParamsForType(params, catalog)).toEqual([problem]);
  });

  it('runs the P2-SEC-1 identifier rule first and stops there', () => {
    expect(validateListParamsForType({ orderBy: 'x][$ne' }, catalog)).toEqual([
      'orderBy must be a plain field name (got "x][$ne")',
    ]);
  });

  it('reports every problem at once', () => {
    expect(
      validateListParamsForType(
        { orderBy: 'body', filters: { nope: { $eq: 1 }, title: { $lt: 'b' } } },
        catalog,
      ),
    ).toEqual([
      'orderBy "body" is not a sortable column',
      'filter "nope" is not a filterable column',
      'filter operator $lt is not allowed on "title"',
    ]);
  });

  it('does not treat prototype keys as columns', () => {
    expect(validateListParamsForType({ orderBy: 'constructor' }, catalog)).toEqual([
      'orderBy "constructor" is not a sortable column',
    ]);
    expect(validateListParamsForType({ filters: { toString: { $eq: 'x' } } }, catalog)).toEqual([
      'filter "toString" is not a filterable column',
    ]);
  });
});

describe('cellValue', () => {
  const item = makeListedItem({ id: 7, data: { title: 'Hello', status: 'shadowed' } });

  it('reads a system column beside data', () => {
    expect(cellValue(item, catalog.byKey.get('id')!)).toBe(7);
    expect(cellValue(item, catalog.byKey.get('status')!)).toBe('draft');
    expect(cellValue(item, catalog.byKey.get('updatedBy')!)).toEqual({
      documentId: 'user-1',
      name: 'Jane Doe',
    });
  });

  it('reads a schema field from data', () => {
    expect(cellValue(item, catalog.byKey.get('title')!)).toBe('Hello');
    expect(cellValue(item, catalog.byKey.get('views')!)).toBeUndefined();
  });

  it('reads publishedAt from data when the row has no such system key', () => {
    const published = makeListedItem({ data: { publishedAt: '2026-02-01T00:00:00.000Z' } });
    expect(cellValue(published, catalog.byKey.get('publishedAt')!)).toBe(
      '2026-02-01T00:00:00.000Z',
    );
  });
});

describe('formatCell', () => {
  it.each<[string, Parameters<typeof formatCell>, ReturnType<typeof formatCell>]>([
    [
      'text keeps the full text in title',
      ['text', 'Hello world'],
      { text: 'Hello world', title: 'Hello world' },
    ],
    ['a number is locale-formatted', ['number', 1234567.5, 'en-US'], { text: '1,234,567.5' }],
    ['a numeric string is formatted', ['number', '42', 'en-US'], { text: '42' }],
    ['a non-numeric number value is shown as text', ['number', 'n/a', 'en-US'], { text: 'n/a' }],
    ['Infinity is shown as text', ['number', Infinity, 'en-US'], { text: 'Infinity' }],
    ['a blank number string is shown as is', ['number', ' ', 'en-US'], { text: ' ' }],
    ['a number object is shown as text', ['number', [1], 'en-US'], { text: '1' }],
    ['true is Yes', ['boolean', true], { text: 'Yes' }],
    ['an odd boolean value as is', ['boolean', 'maybe'], { text: 'maybe' }],
    ['false is No', ['boolean', false], { text: 'No' }],
    ['the string "true" is Yes', ['boolean', 'true'], { text: 'Yes' }],
    ['the string "false" is No', ['boolean', 'false'], { text: 'No' }],
    ['a draft badge', ['status', 'draft'], { text: 'Draft' }],
    ['a modified badge', ['status', 'modified'], { text: 'Modified' }],
    ['a published badge', ['status', 'published'], { text: 'Published' }],
    ['an unknown status as is', ['status', 'archived'], { text: 'archived' }],
    [
      'updatedBy shows the name',
      ['updatedBy', { documentId: 'u', name: 'Jane' }],
      { text: 'Jane' },
    ],
    ['updatedBy without a user', ['updatedBy', null], { text: '—' }],
    ['updatedBy with an empty name', ['updatedBy', { documentId: 'u', name: '' }], { text: '—' }],
    ['a missing value', ['text', undefined], { text: '—' }],
    ['a null value', ['number', null], { text: '—' }],
    ['an empty string', ['text', ''], { text: '—' }],
    ['an object as JSON', ['text', { a: 1 }], { text: '{"a":1}', title: '{"a":1}' }],
    ['an invalid date as is', ['date', 'not a date'], { text: 'not a date' }],
  ])('%s', (_case, args, expected) => {
    expect(formatCell(...args)).toEqual(expected);
  });

  it('formats a date with Intl and keeps the full ISO in title', () => {
    const iso = '2026-03-01T10:30:00.000Z';
    const expected = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
    expect(formatCell('date', iso, 'en-US')).toEqual({ text: expected, title: iso });
  });
});

describe('entryLabeler', () => {
  it('names a row by the first listed text column', () => {
    const label = entryLabeler(['views', 'title'], catalog);

    expect(
      label(makeListedItem({ documentId: 'd1', data: { title: '  Hello  ', views: 3 } })),
    ).toBe('Hello');
  });

  it.each([
    ['a blank text value', ['title'], { title: '   ' }],
    ['a missing text value', ['title'], {}],
    ['no listed text column', ['views', 'status'], { title: 'Hidden' }],
    ['an unknown listed field', ['nope'], { nope: 'x' }],
  ])('falls back to the documentId for %s', (_case, listFields, data) => {
    const label = entryLabeler(listFields, catalog);

    expect(label(makeListedItem({ documentId: 'd1', data }))).toBe('d1');
  });
});
