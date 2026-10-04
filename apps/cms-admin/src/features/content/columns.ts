import { validateListParams } from './listQuery';
import {
  EQUALITY_OPERATORS,
  fieldKind,
  fieldLabel,
  filterOperatorsFor,
  isListableField,
  isSortableField,
  RANGE_OPERATORS,
} from './schema';
import type {
  ContentType,
  DocumentStatus,
  FilterOperator,
  ListedDocumentItem,
  ListParams,
} from './types';

/** How a list column's value is shown and filtered. */
export type ColumnKind = 'text' | 'number' | 'boolean' | 'date' | 'updatedBy' | 'status';

/** One column a list of this content type can show, sort or filter by. */
export interface Column {
  /** The camelCase name: a system column or a top-level schema field. */
  key: string;
  label: string;
  kind: ColumnKind;
  /** A system column (beside `data` in a D1 row) rather than a schema field. */
  system: boolean;
  sortable: boolean;
  listable: boolean;
  /** The filter operators allowed on this column. Empty when it isn't filterable. */
  operators: readonly FilterOperator[];
}

/**
 * Every known column of one content type, plus the three sets the list, the URL parser, the filter
 * panel and the column chooser read (SPEC "Known-column check"). Look columns up through `byKey`.
 */
export interface ColumnCatalog {
  columns: Column[];
  byKey: ReadonlyMap<string, Column>;
  /** Sortable keys, in catalog order. */
  sortable: string[];
  /** Filterable keys with their operators, in catalog order. `status` is never here (D7). */
  filterable: Record<string, readonly FilterOperator[]>;
  /** Keys the column chooser offers, in catalog order. */
  listable: string[];
}

const NONE: readonly FilterOperator[] = [];

const SYSTEM_COLUMNS: readonly Column[] = [
  { key: 'id', label: 'ID', kind: 'number', sortable: true, operators: EQUALITY_OPERATORS },
  {
    key: 'documentId',
    label: 'Document ID',
    kind: 'text',
    sortable: false,
    operators: EQUALITY_OPERATORS,
  },
  { key: 'status', label: 'Status', kind: 'status', sortable: false, operators: NONE },
  { key: 'createdAt', label: 'Created', kind: 'date', sortable: true, operators: RANGE_OPERATORS },
  { key: 'updatedAt', label: 'Updated', kind: 'date', sortable: true, operators: RANGE_OPERATORS },
  {
    key: 'publishedAt',
    label: 'Published',
    kind: 'date',
    sortable: true,
    operators: RANGE_OPERATORS,
  },
  { key: 'updatedBy', label: 'Updated by', kind: 'updatedBy', sortable: false, operators: NONE },
].map((column) => ({ ...column, system: true, listable: true }) as Column);

/**
 * The column catalog of `type`: the system columns, then its top-level text, number and boolean
 * fields in schema order. Other field kinds (richtext, media, json, component, unknown) are not
 * columns at all. A schema field that reuses a system column's name is ignored.
 */
export function buildColumnCatalog(type: Pick<ContentType, 'fields'>): ColumnCatalog {
  const byKey = new Map<string, Column>(SYSTEM_COLUMNS.map((c) => [c.key, c]));
  const columns = [...SYSTEM_COLUMNS];
  for (const field of type.fields) {
    if (!isListableField(field) || byKey.has(field.name)) continue;
    const column: Column = {
      key: field.name,
      label: fieldLabel(field),
      kind: fieldKind(field) as ColumnKind,
      system: false,
      sortable: isSortableField(field),
      listable: true,
      operators: filterOperatorsFor(field),
    };
    byKey.set(column.key, column);
    columns.push(column);
  }
  const filterable: Record<string, readonly FilterOperator[]> = {};
  for (const column of columns) {
    if (column.operators.length > 0) filterable[column.key] = column.operators;
  }
  return {
    columns,
    byKey,
    sortable: columns.filter((c) => c.sortable).map((c) => c.key),
    filterable,
    listable: columns.filter((c) => c.listable).map((c) => c.key),
  };
}

/**
 * Every rule `params` break for this content type (empty when valid). The P2-SEC-1 rules of
 * `validateListParams` run first; when they fail, only their problems are returned. Then `orderBy`
 * must be a sortable column, each filter key a filterable column, and each operator one that
 * column allows (SPEC AC-2).
 */
export function validateListParamsForType(params: ListParams, catalog: ColumnCatalog): string[] {
  const basic = validateListParams(params);
  if (basic.length > 0) return basic;

  const problems: string[] = [];
  const { orderBy } = params;
  if (orderBy !== undefined && !catalog.byKey.get(orderBy)?.sortable) {
    problems.push(`orderBy "${orderBy}" is not a sortable column`);
  }
  for (const [field, ops] of Object.entries(params.filters ?? {})) {
    const used = Object.entries(ops ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([op]) => op as FilterOperator);
    if (used.length === 0) continue;
    const allowed = catalog.byKey.get(field)?.operators ?? NONE;
    if (allowed.length === 0) {
      problems.push(`filter "${field}" is not a filterable column`);
      continue;
    }
    for (const op of used) {
      if (!allowed.includes(op))
        problems.push(`filter operator ${op} is not allowed on "${field}"`);
    }
  }
  return problems;
}

/** The raw value of `column` in a D1 row: a system key beside `data`, otherwise `data[key]`. */
export function cellValue(item: ListedDocumentItem, column: Column): unknown {
  if (column.system && Object.hasOwn(item, column.key)) {
    return item[column.key as keyof ListedDocumentItem];
  }
  return Object.hasOwn(item.data, column.key) ? item.data[column.key] : undefined;
}

/** The column that names a row: the first listed, listable text column, if any. */
export function labelColumn(
  listFields: readonly string[],
  catalog: ColumnCatalog,
): Column | undefined {
  return listFields
    .map((key) => catalog.byKey.get(key))
    .find((column) => column?.listable && column.kind === 'text');
}

/**
 * A row's name, as its link, checkbox, actions menu and bulk summaries show it: the trimmed value of
 * the first listed text column, else its `documentId`.
 */
export function entryLabeler(
  listFields: readonly string[],
  catalog: ColumnCatalog,
): (item: ListedDocumentItem) => string {
  const column = labelColumn(listFields, catalog);
  return (item) => {
    const value = column ? cellValue(item, column) : undefined;
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : item.documentId;
  };
}

/** The status badge text. */
export const STATUS_LABELS: Readonly<Record<DocumentStatus, string>> = {
  draft: 'Draft',
  modified: 'Modified',
  published: 'Published',
};

/** What a list cell shows: its text, and the full value for `title` when the text may be cut. */
export interface CellDisplay {
  text: string;
  title?: string;
}

const EMPTY: CellDisplay = { text: '—' };

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * Formats a list cell for its column kind (SPEC "Cell formatting"): text in full in `title`, numbers
 * with `Intl.NumberFormat`, booleans as Yes/No, dates with `Intl.DateTimeFormat` (full ISO in
 * `title`), `updatedBy` as the name and status as its badge text. A missing or empty value is "—".
 */
export function formatCell(kind: ColumnKind, value: unknown, locale?: string): CellDisplay {
  if (value === null || value === undefined || value === '') return EMPTY;
  switch (kind) {
    case 'number': {
      const n = asNumber(value);
      return { text: n === null ? String(value) : new Intl.NumberFormat(locale).format(n) };
    }
    case 'boolean':
      if (value === true || value === 'true') return { text: 'Yes' };
      if (value === false || value === 'false') return { text: 'No' };
      return { text: String(value) };
    case 'date': {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) return { text: String(value) };
      const text = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
      return { text, title: String(value) };
    }
    case 'updatedBy': {
      const name = typeof value === 'object' && 'name' in value ? value.name : undefined;
      return typeof name === 'string' && name !== '' ? { text: name } : EMPTY;
    }
    case 'status':
      return {
        text: Object.hasOwn(STATUS_LABELS, String(value))
          ? STATUS_LABELS[value as DocumentStatus]
          : String(value),
      };
    default: {
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return { text, title: text };
    }
  }
}
