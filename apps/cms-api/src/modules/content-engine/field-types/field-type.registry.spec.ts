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
