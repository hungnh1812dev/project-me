import { type SCALAR_FIELD_TYPES } from '../ContentEngine.constants';
import { type FieldTypeSpec } from './FieldType.entity';
import { sanitizeRichtext } from './RichtextSanitizer.rules';
import {
  FLOAT4_MAX,
  FLOAT4_MIN_NONZERO,
  INT4_MAX,
  parseBigInteger,
  parseDate,
  parseDatetime,
  parseTime,
  parseUuid,
  VALUE_PATTERNS,
} from './ValueParsers.rules';

type ScalarFieldType = (typeof SCALAR_FIELD_TYPES)[number];

function isWithinFloat4Range(value: number): boolean {
  const magnitude = Math.abs(value);
  return magnitude <= FLOAT4_MAX && (magnitude === 0 || magnitude >= FLOAT4_MIN_NONZERO);
}

const coerceText = (value: unknown) => (typeof value === 'string' ? value : undefined);

/**
 * `text` (short, one line), `string` (long plain text) and `richtext` differ
 * only in validation and editor, so they share a column type and a mask.
 */
const TEXT_LIKE = {
  columnType: 'text',
  conditionKind: 'string',
  listQueryable: true,
  maskedValue: 'sentinel',
  referencesMedia: false,
  acceptsDefault: true,
  canTitleItem: true,
  graphqlOutput: 'String',
  coerceValue: coerceText,
} as const satisfies FieldTypeSpec;

const coerceFiniteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const NUMBER_LIKE = {
  columnType: 'bigint',
  conditionKind: 'decimal',
  listQueryable: true,
  maskedValue: 'null',
  referencesMedia: false,
  acceptsDefault: true,
  canTitleItem: true,
} as const;

export const FIELD_TYPE_SPECS = {
  string: TEXT_LIKE,
  text: TEXT_LIKE,
  // The only richtext rule: no path stores the string as it came.
  richtext: {
    ...TEXT_LIKE,
    canTitleItem: false,
    coerceValue: (value, context) =>
      typeof value === 'string'
        ? sanitizeRichtext(value, { imageOrigins: context?.richtextImageOrigins })
        : undefined,
  },
  integer: {
    columnType: 'integer',
    conditionKind: 'integer',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    acceptsDefault: true,
    canTitleItem: true,
    graphqlOutput: 'Int',
    coerceValue: (value, context) =>
      Number.isInteger(value) &&
      Math.abs(value as number) <= INT4_MAX &&
      !(context?.field?.unsigned === true && (value as number) < 0)
        ? value
        : undefined,
  },
  biginteger: {
    ...NUMBER_LIKE,
    graphqlOutput: 'BigInt',
    // A digit string both ways: a JS number loses digits past 2^53.
    coerceValue: (value) => parseBigInteger(value),
  },
  float: {
    ...NUMBER_LIKE,
    graphqlOutput: 'Float',
    columnType: 'real',
    coerceValue: (value) =>
      typeof value === 'number' && isWithinFloat4Range(value) ? value : undefined,
  },
  double: {
    ...NUMBER_LIKE,
    graphqlOutput: 'Float',
    columnType: 'double precision',
    coerceValue: coerceFiniteNumber,
  },
  decimal: {
    columnType: 'numeric',
    conditionKind: 'decimal',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    acceptsDefault: true,
    canTitleItem: true,
    graphqlOutput: 'Decimal',
    coerceValue: (value) => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
      }
      return typeof value === 'string' && VALUE_PATTERNS.DECIMAL.test(value) ? value : undefined;
    },
  },
  boolean: {
    columnType: 'boolean',
    conditionKind: 'boolean',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    acceptsDefault: true,
    canTitleItem: false,
    graphqlOutput: 'Boolean',
    coerceValue: (value) => (typeof value === 'boolean' ? value : undefined),
  },
  date: {
    columnType: 'date',
    conditionKind: 'date',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    acceptsDefault: true,
    canTitleItem: true,
    graphqlOutput: 'Date',
    coerceValue: (value) => (typeof value === 'string' ? parseDate(value) : undefined),
  },
  datetime: {
    columnType: 'timestamptz',
    conditionKind: 'datetime',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    acceptsDefault: true,
    canTitleItem: true,
    graphqlOutput: 'DateTime',
    coerceValue: (value) => (typeof value === 'string' ? parseDatetime(value) : undefined),
  },
  time: {
    columnType: 'time',
    conditionKind: 'string',
    listQueryable: true,
    maskedValue: 'null',
    referencesMedia: false,
    acceptsDefault: true,
    canTitleItem: true,
    graphqlOutput: 'Time',
    coerceValue: (value) => (typeof value === 'string' ? parseTime(value) : undefined),
  },
  enumeration: {
    ...TEXT_LIKE,
    // Without the field in the context no option list is known, so nothing is accepted.
    coerceValue: (value, context) =>
      typeof value === 'string' && context?.field?.options?.includes(value) === true
        ? value
        : undefined,
  },
  json: {
    columnType: 'jsonb',
    conditionKind: null,
    listQueryable: false,
    maskedValue: 'null',
    referencesMedia: false,
    acceptsDefault: true,
    canTitleItem: false,
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
    acceptsDefault: false,
    canTitleItem: false,
    graphqlOutput: 'Media',
    // The file's public `document_id`; the internal id never crosses the API.
    coerceValue: (value) => (typeof value === 'string' ? parseUuid(value) : undefined),
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
