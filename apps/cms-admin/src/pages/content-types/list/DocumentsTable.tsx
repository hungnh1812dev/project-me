import { useEffect, useId, useRef } from 'react';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  cellValue,
  formatCell,
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
import { cn } from '@/utils/cn';

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
  /** The row actions (filled in by a later phase). */
  renderActions?: (item: ListedDocumentItem) => React.ReactNode;
}

const BOX = 'size-5 shrink-0 cursor-pointer accent-primary lg:size-4';
// The label pads the small native box out to a 44px target below `lg`.
const BOX_TARGET =
  'flex min-h-11 min-w-11 cursor-pointer items-center justify-center lg:min-h-8 lg:min-w-8';

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

/** The column that links to the entry: the first text column, else `documentId`. */
function labelColumnKey(columns: readonly Column[]): string {
  return columns.find((column) => column.kind === 'text')?.key ?? 'documentId';
}

/** A row's name for its checkbox and link: the label column's text, else its `documentId`. */
function rowLabel(item: ListedDocumentItem, labelColumn: Column | undefined): string {
  const value = labelColumn ? cellValue(item, labelColumn) : undefined;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : item.documentId;
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

interface SortHeaderProps {
  column: Column;
  active: boolean;
  sortDir: SortDir;
  onSort: () => void;
}

const SortHeader: React.FC<SortHeaderProps> = ({ column, active, sortDir, onSort }) => {
  const Icon = !active ? ChevronsUpDownIcon : sortDir === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead aria-sort={active ? ARIA_SORT[sortDir] : 'none'} className="px-0">
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:min-h-8',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {column.label}
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      </button>
    </TableHead>
  );
};
SortHeader.displayName = 'SortHeader';

const HeaderCheckbox: React.FC<{
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
}> = ({ checked, indeterminate, disabled, onChange }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className={BOX_TARGET}>
      <input
        ref={ref}
        type="checkbox"
        className={BOX}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="sr-only">Select all entries on this page</span>
    </label>
  );
};
HeaderCheckbox.displayName = 'HeaderCheckbox';

interface CellProps {
  item: ListedDocumentItem;
  column: Column;
  href?: string;
  label: string;
}

const Cell: React.FC<CellProps> = ({ item, column, href, label }) => {
  const value = cellValue(item, column);
  if (href) {
    const display = formatCell(column.kind, value);
    const text = display.text === '—' ? label : display.text;
    return (
      <TableCell>
        <Link
          to={href}
          title={text}
          className="block max-w-64 truncate font-medium text-primary underline-offset-4 hover:underline"
        >
          {text}
        </Link>
      </TableCell>
    );
  }
  if (column.kind === 'status' && Object.hasOwn(STATUS_LABELS, String(value))) {
    return (
      <TableCell>
        <StatusBadge status={value as DocumentStatus} />
      </TableCell>
    );
  }
  const display = formatCell(column.kind, value);
  if (column.kind === 'date' && display.title) {
    return (
      <TableCell className="text-muted-foreground tabular-nums">
        <time dateTime={display.title} title={display.title}>
          {display.text}
        </time>
      </TableCell>
    );
  }
  return (
    <TableCell className={cn(column.kind === 'number' && 'text-right tabular-nums')}>
      <span title={display.title} className="block max-w-64 truncate">
        {display.text}
      </span>
    </TableCell>
  );
};
Cell.displayName = 'Cell';

/**
 * One page of a collection's entries (SPEC "Table"): a captioned table in a labelled, focusable
 * scroll region. Columns are a selection checkbox, the `listFields`, Status and Actions. Cells use
 * `formatCell`; the first text column (else `documentId`) links to the entry. Sortable headers are
 * buttons with `aria-sort`. The header checkbox is tri-state and covers this page only.
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
}) => {
  const captionId = useId();
  const caption = `${type.name} entries`;
  const shown = visibleColumns(type.listFields, catalog);
  const labelKey = labelColumnKey(shown);
  const labelColumn = catalog.byKey.get(labelKey);
  // With no text column listed, the documentId column is added first so every row has a link.
  const columns =
    shown.some((c) => c.key === labelKey) || !labelColumn ? shown : [labelColumn, ...shown];

  const pageIds = items.map((item) => item.documentId);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

  const toggleAll = () => onSelectedChange(allSelected ? new Set() : new Set(pageIds));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };
  const sortBy = (key: string) =>
    onSortChange(key, key === orderBy ? (sortDir === 'desc' ? 'asc' : 'desc') : 'desc');
  const hrefOf = (item: ListedDocumentItem) =>
    `/admin/content-types/${encodeURIComponent(type.slug)}/${encodeURIComponent(item.documentId)}`;

  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="relative w-full overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <table
        data-slot="table"
        aria-busy={busy || undefined}
        className={cn('w-full text-sm transition-opacity', busy && 'opacity-60')}
      >
        <caption id={captionId} className="sr-only">
          {caption}
        </caption>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-11 px-1">
              <HeaderCheckbox
                checked={allSelected}
                indeterminate={selectedOnPage > 0 && !allSelected}
                disabled={pageIds.length === 0}
                onChange={toggleAll}
              />
            </TableHead>
            {columns.map((column) =>
              column.sortable ? (
                <SortHeader
                  key={column.key}
                  column={column}
                  active={column.key === orderBy}
                  sortDir={sortDir}
                  onSort={() => sortBy(column.key)}
                />
              ) : (
                <TableHead key={column.key} className="text-muted-foreground">
                  {column.label}
                </TableHead>
              ),
            )}
            <TableHead className="w-11">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const label = rowLabel(item, labelColumn);
            const isSelected = selected.has(item.documentId);
            return (
              <TableRow key={item.documentId} data-state={isSelected ? 'selected' : undefined}>
                <TableCell className="px-1">
                  <label className={BOX_TARGET}>
                    <input
                      type="checkbox"
                      className={BOX}
                      checked={isSelected}
                      onChange={() => toggle(item.documentId)}
                    />
                    <span className="sr-only">Select {label}</span>
                  </label>
                </TableCell>
                {columns.map((column) => (
                  <Cell
                    key={column.key}
                    item={item}
                    column={column}
                    label={label}
                    href={column.key === labelKey ? hrefOf(item) : undefined}
                  />
                ))}
                <TableCell className="text-right">{renderActions?.(item)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </table>
    </div>
  );
};
DocumentsTable.displayName = 'DocumentsTable';
