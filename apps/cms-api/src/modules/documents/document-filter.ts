import { type Expression, sql, type SqlBool } from 'kysely';

import { BadRequestException } from '@nestjs/common';

import { ERROR_CODES } from '../../common/constants/error.constants';
import {
  RECORD_SYSTEM_COLUMNS,
  RECORD_SYSTEM_FIELDS,
  type RecordSystemField,
  type ConditionValueKind,
  CONDITION_UUID_PATTERN,
} from '../access';
import type { RegisteredContentType } from '../content-engine/registry.service';
import type { FilterClause, SortKey } from './dto/list-documents.query';
import {
  DOCUMENT_ERROR_MESSAGES,
  FILTER_VALUE_PATTERNS,
  INT4_MAX,
  OPERATORS_BY_KIND,
  SYSTEM_FIELD_KINDS,
  YEAR_ZERO_PREFIX,
} from './documents.constants';
import { queryKindOfField } from './queryable-fields';

/** A root column a list query may filter or sort on. */
export interface QueryColumn {
  column: string;
  kind: ConditionValueKind;
}

const SYSTEM_FIELDS: ReadonlySet<string> = new Set(RECORD_SYSTEM_FIELDS);

function invalid(message: string): BadRequestException {
  return new BadRequestException({
    errorCode: ERROR_CODES.BAD_REQUEST,
    message,
  });
}

/**
 * The column of a root system field or top-level scalar field. Components,
 * nested paths, `json` fields (no equality or order) and `media` fields (the
 * stored internal id is private) are not queryable.
 * Call after `QueryGuard.assert`, which already checked the path exists and
 * is readable.
 * @throws BadRequestException when the path cannot be filtered or sorted.
 */
export function queryColumnOf(
  type: RegisteredContentType,
  path: string,
): QueryColumn {
  if (SYSTEM_FIELDS.has(path)) {
    const field = path as RecordSystemField;
    return {
      column: RECORD_SYSTEM_COLUMNS[field],
      kind: SYSTEM_FIELD_KINDS[field],
    };
  }
  const column = type.root.columnsByField.get(path);
  const kind =
    column === undefined ? undefined : queryKindOfField(column.field);
  if (column === undefined || kind === undefined) {
    throw invalid(DOCUMENT_ERROR_MESSAGES.UNSUPPORTED_FIELD);
  }
  return { column: column.name, kind };
}

type FilterValue = string | number | boolean;

/** Postgres has no year 0, and rejects it with an error (a 500, not a 400). */
const hasYearZero = (raw: string) => raw.startsWith(YEAR_ZERO_PREFIX);

function validDate(raw: string): boolean {
  return (
    FILTER_VALUE_PATTERNS.DATE.test(raw) &&
    !hasYearZero(raw) &&
    new Date(`${raw}T00:00:00Z`).toISOString().startsWith(raw)
  );
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
      return FILTER_VALUE_PATTERNS.INTEGER.test(raw) &&
        Math.abs(value) <= INT4_MAX
        ? value
        : undefined;
    }
    case 'decimal':
      return FILTER_VALUE_PATTERNS.DECIMAL.test(raw) ? raw : undefined;
    case 'boolean':
      if (raw === 'true') return true;
      return raw === 'false' ? false : undefined;
    case 'date':
      return validDate(raw) ? raw : undefined;
    case 'datetime': {
      const time = Date.parse(raw);
      return FILTER_VALUE_PATTERNS.DATETIME.test(raw) &&
        !hasYearZero(raw) &&
        Number.isFinite(time)
        ? new Date(time).toISOString()
        : undefined;
    }
    case 'uuid':
      return CONDITION_UUID_PATTERN.test(raw) ? raw.toLowerCase() : undefined;
  }
}

function escapeLike(raw: string): string {
  return raw.replace(FILTER_VALUE_PATTERNS.LIKE_SPECIALS, '\\$&');
}

/**
 * One filter as parameterized SQL: the column comes from the registry plan
 * (`queryColumnOf`), the operator from a fixed switch, and every value is a
 * bind parameter (`contains` has its LIKE wildcards escaped).
 * @throws BadRequestException on an operator or value the field cannot take.
 */
export function filterExpression(
  target: QueryColumn,
  clause: FilterClause,
): Expression<SqlBool> {
  if (!OPERATORS_BY_KIND[target.kind].includes(clause.op)) {
    throw invalid(DOCUMENT_ERROR_MESSAGES.UNSUPPORTED_OPERATOR);
  }
  const values = clause.values.map((raw) =>
    coerceFilterValue(target.kind, raw),
  );
  const typed = values.filter((value) => value !== undefined);
  if (typed.length !== values.length) {
    throw invalid(DOCUMENT_ERROR_MESSAGES.INVALID_VALUE);
  }
  const column = sql.ref(target.column);
  const [first] = typed;
  switch (clause.op) {
    case 'in':
      return sql<SqlBool>`${column} in (${sql.join(typed)})`;
    case 'eq':
      return sql<SqlBool>`${column} = ${first}`;
    // NULL is not equal to the value, so `ne` keeps those rows.
    case 'ne':
      return sql<SqlBool>`${column} is distinct from ${first}`;
    case 'gt':
      return sql<SqlBool>`${column} > ${first}`;
    case 'gte':
      return sql<SqlBool>`${column} >= ${first}`;
    case 'lt':
      return sql<SqlBool>`${column} < ${first}`;
    case 'lte':
      return sql<SqlBool>`${column} <= ${first}`;
    case 'contains':
      return sql<SqlBool>`${column} ilike ${`%${escapeLike(String(first))}%`}`;
  }
}

/** Column and direction of a sort key, in query order. */
export function sortTarget(
  type: RegisteredContentType,
  key: SortKey,
): QueryColumn & { direction: SortKey['direction'] } {
  return { ...queryColumnOf(type, key.path), direction: key.direction };
}
