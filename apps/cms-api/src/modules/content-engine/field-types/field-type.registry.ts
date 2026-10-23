import { type SCALAR_FIELD_TYPES } from '../content-engine.constants';

import { type FieldTypeSpec } from './field-type-spec';
import { sanitizeRichtext } from './richtext.sanitizer';
import { parseDate, parseDatetime, parseUuid } from './value-parsers';
import { INT4_MAX, VALUE_PATTERNS } from './value-patterns';

type ScalarFieldType = (typeof SCALAR_FIELD_TYPES)[number];

const coerceText = (value: unknown) =>
  typeof value === 'string' ? value : undefined;

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
  coerceValue: coerceText,
} as const satisfies FieldTypeSpec;

export const FIELD_TYPE_SPECS = {
  string: TEXT_LIKE,
  text: TEXT_LIKE,
  // The only richtext rule: no path stores the string as it came.
  richtext: {
    ...TEXT_LIKE,
    coerceValue: (value) =>
      typeof value === 'string' ? sanitizeRichtext(value) : undefined,
  },
  integer: {
    columnType: 'integer',
    conditionKind: 'integer',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'Int',
    coerceValue: (value) =>
      Number.isInteger(value) && Math.abs(value as number) <= INT4_MAX
        ? value
        : undefined,
  },
  decimal: {
    columnType: 'numeric',
    conditionKind: 'decimal',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'Decimal',
    coerceValue: (value) => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
      }
      return typeof value === 'string' && VALUE_PATTERNS.DECIMAL.test(value)
        ? value
        : undefined;
    },
  },
  boolean: {
    columnType: 'boolean',
    conditionKind: 'boolean',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'Boolean',
    coerceValue: (value) => (typeof value === 'boolean' ? value : undefined),
  },
  date: {
    columnType: 'date',
    conditionKind: 'date',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'Date',
    coerceValue: (value) =>
      typeof value === 'string' ? parseDate(value) : undefined,
  },
  datetime: {
    columnType: 'timestamptz',
    conditionKind: 'datetime',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'DateTime',
    coerceValue: (value) =>
      typeof value === 'string' ? parseDatetime(value) : undefined,
  },
  json: {
    columnType: 'jsonb',
    conditionKind: null,
    listQueryable: false,
    maskedValue: 'null',
    referencesMedia: false,
    graphqlOutput: 'Json',
    // Any JSON value is valid; the column encode below only serializes it.
    coerceValue: (value) => value,
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
    // The file's public `document_id`; the internal id never crosses the API.
    coerceValue: (value) =>
      typeof value === 'string' ? parseUuid(value) : undefined,
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
