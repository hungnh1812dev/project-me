import { describe, expect, it } from 'vitest';

import {
  entryHint,
  entryLabel,
  fieldKind,
  fieldLabel,
  filterOperatorsFor,
  isListableField,
  isSortableField,
  UNTITLED_ENTRY,
  widthClass,
} from './schema';
import type { FieldDefinition, FieldType } from './types';

const field = (type: string, extra: Partial<FieldDefinition> = {}): FieldDefinition => ({
  name: 'x',
  type: type as FieldType,
  ...extra,
});

describe('fieldKind', () => {
  it.each<[string, FieldDefinition, string]>([
    ['text', field('text'), 'text'],
    ['richtext', field('richtext'), 'richtext'],
    ['number', field('number'), 'number'],
    ['boolean', field('boolean'), 'boolean'],
    ['media', field('media'), 'media'],
    ['json', field('json'), 'json'],
    ['a component', field('component', { fields: [] }), 'component'],
    ['a repeatable component', field('component', { repeatable: true }), 'repeatable'],
    ['an unknown type', field('geo'), 'unknown'],
    ['a prototype key as type', field('toString'), 'unknown'],
  ])('%s -> %s', (_case, input, kind) => {
    expect(fieldKind(input)).toBe(kind);
  });
});

describe('isSortableField and isListableField (AC-1)', () => {
  it.each<[string, boolean]>([
    ['text', true],
    ['number', true],
    ['boolean', true],
    ['richtext', false],
    ['media', false],
    ['json', false],
    ['component', false],
    ['geo', false],
  ])('%s -> %s', (type, expected) => {
    expect(isSortableField(field(type))).toBe(expected);
    expect(isListableField(field(type))).toBe(expected);
  });

  it('never sorts or lists a repeatable component', () => {
    const repeatable = field('component', { repeatable: true });
    expect(isSortableField(repeatable)).toBe(false);
    expect(isListableField(repeatable)).toBe(false);
  });
});

describe('filterOperatorsFor (AC-1)', () => {
  it.each<[string, string[]]>([
    ['text', ['$eq', '$ne', '$contains']],
    ['number', ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte']],
    ['boolean', ['$eq', '$ne']],
    ['richtext', []],
    ['media', []],
    ['json', []],
    ['component', []],
    ['geo', []],
  ])('%s -> %j', (type, ops) => {
    expect(filterOperatorsFor(field(type))).toEqual(ops);
  });
});

describe('widthClass', () => {
  it.each<[string | undefined, string]>([
    ['100%', 'md:col-span-6'],
    ['50%', 'md:col-span-3'],
    ['1/3', 'md:col-span-2'],
    ['25%', 'md:col-span-6'],
    [undefined, 'md:col-span-6'],
    ['', 'md:col-span-6'],
  ])('%s -> %s', (width, cls) => {
    expect(widthClass(width)).toBe(cls);
  });
});

describe('fieldLabel', () => {
  it.each<[string, string]>([
    ['title', 'Title'],
    ['coverImage', 'Cover image'],
    ['cover_image', 'Cover image'],
    ['cover-image', 'Cover image'],
    ['seoURLSlug', 'Seo url slug'],
    ['heroImage2', 'Hero image2'],
    ['ALLCAPS', 'Allcaps'],
    ['', ''],
  ])('%s -> %s', (name, label) => {
    expect(fieldLabel({ name })).toBe(label);
  });
});

describe('entryHint and entryLabel (AC-39)', () => {
  const fields: FieldDefinition[] = [
    { name: 'slug', type: 'text' },
    { name: 'body', type: 'richtext' },
    { name: 'title', type: 'text', header: true },
    { name: 'subtitle', type: 'text', header: true },
  ];

  it('prefers the first text field marked header', () => {
    expect(entryHint(fields, { slug: 'hello', title: 'Hello world', subtitle: 'Sub' })).toBe(
      'Hello world',
    );
  });

  it('skips a header field with an empty value', () => {
    expect(entryHint(fields, { slug: 'hello', title: '  ', subtitle: 'Sub' })).toBe('Sub');
  });

  it('falls back to the first text field with a value', () => {
    expect(entryHint(fields, { slug: 'hello', body: '<p>x</p>' })).toBe('hello');
  });

  it('ignores a header field that is not text', () => {
    const nonText: FieldDefinition[] = [
      { name: 'views', type: 'number', header: true },
      { name: 'name', type: 'text' },
    ];
    expect(entryHint(nonText, { views: 3, name: 'Ann' })).toBe('Ann');
  });

  it('ignores non-string values', () => {
    expect(entryHint(fields, { slug: 42, title: null })).toBeNull();
  });

  it('trims the hint', () => {
    expect(entryHint(fields, { title: '  Spaced  ' })).toBe('Spaced');
  });

  it('is null without text fields or values', () => {
    expect(entryHint([{ name: 'n', type: 'number' }], { n: 1 })).toBeNull();
    expect(entryHint(fields, null)).toBeNull();
    expect(entryHint(fields, undefined)).toBeNull();
    expect(entryHint(fields, 'not an object')).toBeNull();
  });

  it('labels an entry with its hint, or "Untitled entry"', () => {
    expect(entryLabel(fields, { title: 'Hello' })).toBe('Hello');
    expect(entryLabel(fields, {})).toBe(UNTITLED_ENTRY);
    expect(UNTITLED_ENTRY).toBe('Untitled entry');
  });
});
