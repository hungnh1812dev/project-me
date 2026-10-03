import type { ColumnCatalog, ColumnKind } from './columns';
import type { ListFilter } from './listState';
import type { FilterOperator } from './types';

const BASE_LABELS: Record<FilterOperator, string> = {
  $eq: 'is',
  $ne: 'is not',
  $contains: 'contains',
  $gt: 'is greater than',
  $gte: 'is at least',
  $lt: 'is less than',
  $lte: 'is at most',
};

const DATE_LABELS: Partial<Record<FilterOperator, string>> = {
  $gt: 'is after',
  $gte: 'is on or after',
  $lt: 'is before',
  $lte: 'is on or before',
};

/** How an operator reads for a column kind, for example "is after" on a date. */
export function operatorLabel(kind: ColumnKind, op: FilterOperator): string {
  return (kind === 'date' && DATE_LABELS[op]) || BASE_LABELS[op];
}

/** A filter value as shown in a chip: Yes/No, a formatted number or day, or quoted text. */
function valueLabel(kind: ColumnKind, value: string, locale?: string): string {
  switch (kind) {
    case 'boolean':
      return value === 'true' ? 'Yes' : 'No';
    case 'number':
      return new Intl.NumberFormat(locale).format(Number(value));
    case 'date':
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
    default:
      return `“${value}”`;
  }
}

/** The chip text of one active filter, for example "Featured is Yes". */
export function filterChipLabel(
  catalog: ColumnCatalog,
  field: string,
  { op, value }: ListFilter,
  locale?: string,
): string {
  const column = catalog.byKey.get(field);
  if (!column) return `${field} ${BASE_LABELS[op]} ${value}`;
  return `${column.label} ${operatorLabel(column.kind, op)} ${valueLabel(column.kind, value, locale)}`;
}
