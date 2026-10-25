import { type Expression, sql, type SqlBool } from 'kysely';

import {
  RECORD_SYSTEM_COLUMNS,
  RECORD_SYSTEM_FIELDS,
  type ConditionValueKind,
  type RecordSystemField,
} from '../../access';
import type { RegisteredContentType } from '../../content-engine';
import {
  DOCUMENT_ERROR_MESSAGES,
  SYSTEM_FIELD_KINDS,
} from '../domain/Documents.constants';
import {
  filterRefused,
  typedFilterValues,
} from '../domain/DocumentFilter.rules';
import type { FilterClause, SortKey } from '../domain/ListQuery.entity';
import { queryKindOfField } from '../domain/QueryableFields.rules';
import { LIKE_SPECIALS_PATTERN } from './DocumentsSql.constants';

/** A root column a list query may filter or sort on. */
export interface QueryColumn {
  column: string;
  kind: ConditionValueKind;
}

const SYSTEM_FIELDS: ReadonlySet<string> = new Set(RECORD_SYSTEM_FIELDS);

/**
 * The column of a root system field or top-level scalar field. Components,
 * nested paths, `json` fields (no equality or order) and `media` fields (the
 * stored internal id is private) are not queryable.
 * Call after `QueryGuard.assert`, which already checked the path exists and
 * is readable.
 * @throws DomainError (invalid_input) when the path cannot be filtered or sorted.
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
    throw filterRefused(DOCUMENT_ERROR_MESSAGES.UNSUPPORTED_FIELD);
  }
  return { column: column.name, kind };
}

function escapeLike(raw: string): string {
  return raw.replace(LIKE_SPECIALS_PATTERN, '\\$&');
}

/**
 * One filter as parameterized SQL: the column comes from the registry plan
 * (`queryColumnOf`), the operator from a fixed switch, and every value is a
 * bind parameter (`contains` has its LIKE wildcards escaped).
 * @throws DomainError (invalid_input) on an operator or value the field cannot take.
 */
export function filterExpression(
  target: QueryColumn,
  clause: FilterClause,
): Expression<SqlBool> {
  const typed = typedFilterValues(target.kind, clause);
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
