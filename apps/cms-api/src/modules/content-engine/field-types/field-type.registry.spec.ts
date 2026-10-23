import { SCALAR_FIELD_TYPES } from '../content-engine.constants';

import { FIELD_TYPE_SPECS, fieldTypeOf } from './field-type.registry';

const typesWhere = (
  predicate: (
    spec: (typeof FIELD_TYPE_SPECS)[keyof typeof FIELD_TYPE_SPECS],
  ) => boolean,
) => SCALAR_FIELD_TYPES.filter((type) => predicate(FIELD_TYPE_SPECS[type]));

describe('field type registry', () => {
  it('has one spec per scalar type and no other', () => {
    expect(Object.keys(FIELD_TYPE_SPECS).sort()).toEqual(
      [...SCALAR_FIELD_TYPES].sort(),
    );
  });

  it('marks exactly media as referencing a media file', () => {
    expect(typesWhere((spec) => spec.referencesMedia)).toEqual(['media']);
  });

  it('keeps media and json out of list filters and sorts', () => {
    expect(typesWhere((spec) => !spec.listQueryable).sort()).toEqual([
      'json',
      'media',
    ]);
  });

  it('keeps media usable in conditions even though it is not list-queryable', () => {
    expect(FIELD_TYPE_SPECS.media.conditionKind).toBe('integer');
    expect(FIELD_TYPE_SPECS.json.conditionKind).toBeNull();
  });

  it('masks only text-like types with the sentinel', () => {
    expect(typesWhere((spec) => spec.maskedValue === 'sentinel')).toEqual([
      'string',
      'text',
      'richtext',
    ]);
  });

  it('keeps the column types the generated SQL was built with', () => {
    expect(
      Object.fromEntries(
        SCALAR_FIELD_TYPES.map((type) => [
          type,
          FIELD_TYPE_SPECS[type].columnType,
        ]),
      ),
    ).toEqual({
      string: 'text',
      text: 'text',
      richtext: 'text',
      integer: 'integer',
      decimal: 'numeric',
      boolean: 'boolean',
      date: 'date',
      datetime: 'timestamptz',
      json: 'jsonb',
      media: 'integer',
    });
  });

  it('encodes json as text and no other type', () => {
    expect(FIELD_TYPE_SPECS.json.encodeForColumn([1, 2])).toBe('[1,2]');
    expect(typesWhere((spec) => 'encodeForColumn' in spec)).toEqual(['json']);
  });

  describe('fieldTypeOf', () => {
    it('resolves a scalar type', () => {
      expect(fieldTypeOf('media')).toBe(FIELD_TYPE_SPECS.media);
    });

    it.each(['component', 'unknown', 'constructor', 'toString', '__proto__'])(
      'returns undefined for %s',
      (key) => {
        expect(fieldTypeOf(key)).toBeUndefined();
      },
    );
  });
});

describe('coerceValue', () => {
  const coerce = (type: string, value: unknown) =>
    fieldTypeOf(type)?.coerceValue(value);

  it('sanitizes richtext and never stores it raw', () => {
    const out = coerce('richtext', '<p>hi</p><img src=x onerror=alert(1)>');
    expect(out).toBe('<p>hi</p>');
    expect(coerce('richtext', 5)).toBeUndefined();
  });

  it('keeps text as it is and refuses non-strings', () => {
    expect(coerce('text', '<b>x</b>')).toBe('<b>x</b>');
    expect(coerce('string', 1)).toBeUndefined();
  });

  it.each([
    ['integer', 7, 7],
    ['integer', 2_147_483_647, 2_147_483_647],
    ['decimal', '1.50', '1.50'],
    ['decimal', 1.5, 1.5],
    ['boolean', false, false],
    ['date', '2026-02-28', '2026-02-28'],
    ['datetime', '2026-03-01T10:00:00+07:00', '2026-03-01T03:00:00.000Z'],
    [
      'media',
      '0A0A0A0A-0A0A-4A0A-8A0A-0A0A0A0A0A0A',
      '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a',
    ],
  ])('%s accepts %p', (type, value, expected) => {
    expect(coerce(type, value)).toBe(expected);
  });

  it.each([
    ['integer', 1.5],
    ['integer', 2_147_483_648],
    ['integer', '1'],
    ['decimal', Infinity],
    ['decimal', '1,5'],
    ['boolean', 'true'],
    ['date', '2026-02-31'],
    ['date', '0000-01-01'],
    ['date', '2026-13-45'],
    ['datetime', 'yesterday'],
    ['datetime', '2026-02-31T10:00:00Z'],
    ['datetime', '2026-02-31'],
    ['datetime', '0000-01-01T00:00:00Z'],
    ['media', 12],
    ['media', 'not-a-uuid'],
  ])('%s refuses %p', (type, value) => {
    expect(coerce(type, value)).toBeUndefined();
  });

  it('passes any json value through', () => {
    expect(coerce('json', [1, { a: null }])).toEqual([1, { a: null }]);
  });

  it('has a rule for every scalar type', () => {
    for (const type of SCALAR_FIELD_TYPES) {
      expect(typeof FIELD_TYPE_SPECS[type].coerceValue).toBe('function');
    }
  });
});
