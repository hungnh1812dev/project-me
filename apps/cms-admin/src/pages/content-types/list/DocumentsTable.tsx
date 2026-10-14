import { Link } from 'react-router-dom';

import { DataTable, type DataTableColumn } from '@repo/form-commons/components/forms/DataTable';

import {
  cellValue,
  entryLabeler,
  formatCell,
  labelColumn,
  STATUS_LABELS,
  type Column,
  type ColumnCatalog,
} from '@/features/content/columns';
import type {
  ContentType,
  DocumentStatus,
  ListedDocumentItem,
  SortDir,
} from '@/features/content/types';

import { StatusBadge } from '../editor/EditorHeader';

export interface DocumentsTableProps {
  type: Pick<ContentType, 'slug' | 'name' | 'listFields'>;
  catalog: ColumnCatalog;
  items: ListedDocumentItem[];
  orderBy: string;
  sortDir: SortDir;
  /** Called with the next sort: a new column starts descending, the active one flips. */
  onSortChange: (orderBy: string, sortDir: SortDir) => void;
  /** The selected `documentId`s on this page. */
  selected: ReadonlySet<string>;
  onSelectedChange: (next: Set<string>) => void;
  /** While the next page loads: the old rows stay, and the table is `aria-busy`. */
  busy?: boolean;
  /** The row actions, given the row and its label (as in its link and checkbox). */
  renderActions?: (item: ListedDocumentItem, label: string) => React.ReactNode;
  /** The focusable scroll region, for moving focus to the list after a delete. */
  regionRef?: React.Ref<HTMLDivElement>;
}

/** The columns shown, in order: the known `listFields`, then Status unless it is listed already. */
function visibleColumns(listFields: readonly string[], catalog: ColumnCatalog): Column[] {
  const columns = listFields
    .map((key) => catalog.byKey.get(key))
    .filter((column): column is Column => column !== undefined && column.listable);
  if (!columns.some((column) => column.key === 'status')) {
    const status = catalog.byKey.get('status');
    if (status) columns.push(status);
  }
  return columns;
}

/** The classes of a column's cells, by kind. */
function cellClassName(column: Column): string | undefined {
  if (column.kind === 'number') return 'text-right tabular-nums';
  if (column.kind === 'date') return 'text-muted-foreground tabular-nums';
  return undefined;
}

interface CellContentProps {
  item: ListedDocumentItem;
  column: Column;
  href?: string;
  label: string;
}

const CellContent: React.FC<CellContentProps> = ({ item, column, href, label }) => {
  const value = cellValue(item, column);
  if (href) {
    const display = formatCell(column.kind, value);
    const text = display.text === '—' ? label : display.text;
    return (
      <Link
        to={href}
        title={text}
        className="block max-w-64 truncate font-medium text-primary-ink underline-offset-4 hover:underline"
      >
        {text}
      </Link>
    );
  }
  if (column.kind === 'status' && Object.hasOwn(STATUS_LABELS, String(value))) {
    return <StatusBadge status={value as DocumentStatus} />;
  }
  const display = formatCell(column.kind, value);
  if (column.kind === 'date' && display.title) {
    return (
      <time dateTime={display.title} title={display.title}>
        {display.text}
      </time>
    );
  }
  return (
    <span title={display.title} className="block max-w-64 truncate">
      {display.text}
    </span>
  );
};
CellContent.displayName = 'CellContent';

/**
 * One page of a collection's entries (SPEC "Table") on the package `DataTable`, which gives the
 * captioned table in a focusable region, sort buttons with `aria-sort` and the tri-state page
 * selection. Columns are a selection checkbox, the `listFields`, Status and Actions. Cells use
 * `formatCell`; the first text column (else `documentId`) links to the entry.
 */
export const DocumentsTable: React.FC<DocumentsTableProps> = ({
  type,
  catalog,
  items,
  orderBy,
  sortDir,
  onSortChange,
  selected,
  onSelectedChange,
  busy = false,
  renderActions,
  regionRef,
}) => {
  const shown = visibleColumns(type.listFields, catalog);
  // The first text column links to the entry, else `documentId`.
  const labelKey = labelColumn(type.listFields, catalog)?.key ?? 'documentId';
  const linkColumn = catalog.byKey.get(labelKey);
  const rowLabel = entryLabeler(type.listFields, catalog);
  // With no text column listed, the documentId column is added first so every row has a link.
  const columns =
    shown.some((c) => c.key === labelKey) || !linkColumn ? shown : [linkColumn, ...shown];
  const hrefOf = (item: ListedDocumentItem) =>
    `/admin/content-types/${encodeURIComponent(type.slug)}/${encodeURIComponent(item.documentId)}`;

  const tableColumns: DataTableColumn<ListedDocumentItem>[] = columns.map((column) => ({
    key: column.key,
    header: column.label,
    sortable: column.sortable,
    cellClassName: cellClassName(column),
    cell: (item) => (
      <CellContent
        item={item}
        column={column}
        label={rowLabel(item)}
        href={column.key === labelKey ? hrefOf(item) : undefined}
      />
    ),
  }));

  return (
    <DataTable
      caption={`${type.name} entries`}
      columns={tableColumns}
      rows={items}
      rowKey={(item) => item.documentId}
      rowLabel={rowLabel}
      sort={{ orderBy, sortDir, onSortChange }}
      selection={{ selected, onSelectedChange, allLabel: 'Select all entries on this page' }}
      busy={busy}
      // The Actions column is always there, so the columns don't shift while actions load.
      renderActions={(item, label) => renderActions?.(item, label)}
      regionRef={regionRef}
    />
  );
};
DocumentsTable.displayName = 'DocumentsTable';
