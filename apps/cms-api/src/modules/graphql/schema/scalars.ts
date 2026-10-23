import {
  GraphQLError,
  GraphQLScalarType,
  Kind,
  type ConstValueNode,
  valueFromASTUntyped,
} from 'graphql';

import { FILTER_VALUE_PATTERNS } from '../../documents';
import { SCALAR_NAMES } from '../graphql.constants';

/** Length of `YYYY-MM-DD`. */
const DATE_LENGTH = 10;

function expectString(value: unknown, scalar: string): string {
  if (typeof value !== 'string') {
    throw new GraphQLError(`${scalar} must be a string.`);
  }
  return value;
}

function stringLiteral(node: ConstValueNode, scalar: string): string {
  if (node.kind !== Kind.STRING) {
    throw new GraphQLError(`${scalar} must be a string.`, { nodes: node });
  }
  return node.value;
}

function patterned(value: string, pattern: RegExp, scalar: string): string {
  if (!pattern.test(value)) {
    throw new GraphQLError(`${scalar} has an invalid format.`);
  }
  return value;
}

/** Output of a stored value that may be a string already or a driver `Date`. */
function dateOutput(value: unknown, scalar: string): string {
  if (value instanceof Date) return value.toISOString();
  return expectString(value, scalar);
}

/** `YYYY-MM-DD`, a string on the wire as in REST. */
export const DateScalar = new GraphQLScalarType<string, string>({
  name: SCALAR_NAMES.DATE,
  description: 'Calendar date, "YYYY-MM-DD".',
  coerceOutputValue: (value) =>
    value instanceof Date
      ? value.toISOString().slice(0, DATE_LENGTH)
      : expectString(value, SCALAR_NAMES.DATE),
  coerceInputValue: (value) =>
    patterned(
      expectString(value, SCALAR_NAMES.DATE),
      FILTER_VALUE_PATTERNS.DATE,
      SCALAR_NAMES.DATE,
    ),
  coerceInputLiteral: (node) =>
    patterned(
      stringLiteral(node, SCALAR_NAMES.DATE),
      FILTER_VALUE_PATTERNS.DATE,
      SCALAR_NAMES.DATE,
    ),
});

/** ISO 8601 date and time string. */
export const DateTimeScalar = new GraphQLScalarType<string, string>({
  name: SCALAR_NAMES.DATE_TIME,
  description: 'ISO 8601 date and time.',
  coerceOutputValue: (value) => dateOutput(value, SCALAR_NAMES.DATE_TIME),
  coerceInputValue: (value) =>
    patterned(
      expectString(value, SCALAR_NAMES.DATE_TIME),
      FILTER_VALUE_PATTERNS.DATETIME,
      SCALAR_NAMES.DATE_TIME,
    ),
  coerceInputLiteral: (node) =>
    patterned(
      stringLiteral(node, SCALAR_NAMES.DATE_TIME),
      FILTER_VALUE_PATTERNS.DATETIME,
      SCALAR_NAMES.DATE_TIME,
    ),
});

/** Exact decimal, a string so no precision is lost (as in REST). */
export const DecimalScalar = new GraphQLScalarType<string, string>({
  name: SCALAR_NAMES.DECIMAL,
  description: 'Exact decimal number as a string.',
  coerceOutputValue: (value) =>
    typeof value === 'number'
      ? String(value)
      : expectString(value, SCALAR_NAMES.DECIMAL),
  coerceInputValue: (value) =>
    patterned(
      expectString(value, SCALAR_NAMES.DECIMAL),
      FILTER_VALUE_PATTERNS.DECIMAL,
      SCALAR_NAMES.DECIMAL,
    ),
  coerceInputLiteral: (node) =>
    patterned(
      stringLiteral(node, SCALAR_NAMES.DECIMAL),
      FILTER_VALUE_PATTERNS.DECIMAL,
      SCALAR_NAMES.DECIMAL,
    ),
});

/** Any JSON value; output only (json fields cannot be filtered). */
export const JsonScalar = new GraphQLScalarType<unknown, unknown>({
  name: SCALAR_NAMES.JSON,
  description: 'Any JSON value.',
  coerceOutputValue: (value) => value,
  coerceInputValue: (value) => value,
  coerceInputLiteral: (node) => valueFromASTUntyped(node),
});
