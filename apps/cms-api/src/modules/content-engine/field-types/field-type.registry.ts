import { type SCALAR_FIELD_TYPES } from '../content-engine.constants';

import { type FieldTypeSpec } from './field-type-spec';

type ScalarFieldType = (typeof SCALAR_FIELD_TYPES)[number];

/**
 * `string`, `text` and `richtext` differ only in validation and editor, so
 * they share a column type and a mask.
 */
const TEXT_LIKE = {
  columnType: 'text',
  conditionKind: 'string',
  listQueryable: true,
  maskedValue: 'sentinel',
  referencesMedia: false,
  graphqlOutput: 'String',
} as const satisfies FieldTypeSpec;

export const FIELD_TYPE_SPECS = {
  string: TEXT_LIKE,
  text: TEXT_LIKE,
  richtext: TEXT_LIKE,
  integer: {
    columnType: 'integer',
    conditionKind: 'integer',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'Int',
  },
  decimal: {
    columnType: 'numeric',
    conditionKind: 'decimal',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'Decimal',
  },
  boolean: {
    columnType: 'boolean',
    conditionKind: 'boolean',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'Boolean',
  },
  date: {
    columnType: 'date',
    conditionKind: 'date',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'Date',
  },
  datetime: {
    columnType: 'timestamptz',
    conditionKind: 'datetime',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'DateTime',
  },
  json: {
    columnType: 'jsonb',
    conditionKind: null,
    listQueryable: false,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'Json',
    // Sent as text so arrays stay JSON and are not read as PG arrays.
    encodeForColumn: (value) => JSON.stringify(value),
  },
  media: {
    columnType: 'integer',
    conditionKind: 'integer',
    listQueryable: false,
    maskedValue: 'null',
    referencesMedia: true,
    graphqlOutput: 'Media',
  },
} as const satisfies Record<ScalarFieldType, FieldTypeSpec>;

/**
 * Spec of a scalar field type; `undefined` for `component` and any unknown
 * key. `Object.hasOwn` keeps prototype keys (`constructor`) from resolving.
 */
export function fieldTypeOf(type: string): FieldTypeSpec | undefined {
  return Object.hasOwn(FIELD_TYPE_SPECS, type)
    ? FIELD_TYPE_SPECS[type as ScalarFieldType]
    : undefined;
}
