import { ERROR_CODES } from '../../../common/constants/Error.constants';
import { DomainError } from '../../../common/errors/Domain.errors';
import type { ConditionValueKind } from '../../access';
import {
  INT4_MAX,
  parseDate,
  parseDatetime,
  parseUuid,
  VALUE_PATTERNS,
} from '../../content-engine';
import {
  DOCUMENT_ERROR_MESSAGES,
  OPERATORS_BY_KIND,
} from './Documents.constants';
import type { FilterClause } from './ListQuery.rules';

export type FilterValue = string | number | boolean;

export function filterRefused(message: string): DomainError {
  return new DomainError({
    kind: 'invalid_input',
    errorCode: ERROR_CODES.BAD_REQUEST,
    message,
  });
}

/** A URL string as the typed value its column compares with; undefined = invalid. */
export function coerceFilterValue(
  kind: ConditionValueKind,
  raw: string,
): FilterValue | undefined {
  switch (kind) {
    case 'string':
      return raw;
    case 'integer': {
      const value = Number(raw);
      return VALUE_PATTERNS.INTEGER.test(raw) && Math.abs(value) <= INT4_MAX
        ? value
        : undefined;
    }
    case 'decimal':
      return VALUE_PATTERNS.DECIMAL.test(raw) ? raw : undefined;
    case 'boolean':
      if (raw === 'true') return true;
      return raw === 'false' ? false : undefined;
    case 'date':
      return parseDate(raw);
    case 'datetime':
      return parseDatetime(raw);
    case 'uuid':
      return parseUuid(raw);
    default: {
      // A kind added without a rule here is refused, never passed through.
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/**
 * The typed values of one filter, after the operator is checked against the
 * field's value kind. The first thing a SQL adapter calls, so no value
 * reaches a query unchecked.
 * @throws DomainError (invalid_input) on an operator or value the field cannot take.
 */
export function typedFilterValues(
  kind: ConditionValueKind,
  clause: FilterClause,
): FilterValue[] {
  if (!OPERATORS_BY_KIND[kind].includes(clause.op)) {
    throw filterRefused(DOCUMENT_ERROR_MESSAGES.UNSUPPORTED_OPERATOR);
  }
  const values = clause.values.map((raw) => coerceFilterValue(kind, raw));
  const typed = values.filter((value) => value !== undefined);
  if (typed.length !== values.length) {
    throw filterRefused(DOCUMENT_ERROR_MESSAGES.INVALID_VALUE);
  }
  return typed;
}
