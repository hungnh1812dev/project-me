'use client';

import { useId, type ReactNode, type Ref } from 'react';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';

import { cn } from '../../lib/cn';
import { Checkbox } from '../ui/checkbox';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

export type SortDir = 'asc' | 'desc';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Only used with the table's `sort`: the header becomes a sort button with `aria-sort`. */
  sortable?: boolean;
  /** The content of this column's cell for `row`. */
  cell: (row: T) => ReactNode;
  cellClassName?: string;
}

export interface DataTableSort {
  orderBy: string;
  sortDir: SortDir;
  /** Called with the next sort: a new column starts descending, the active one flips. */
  onSortChange: (orderBy: string, sortDir: SortDir) => void;
}

export interface DataTableSelection {
  /** The selected row keys on this page. */
  selected: ReadonlySet<string>;
  onSelectedChange: (next: Set<string>) => void;
  /** The header checkbox's name. Defaults to "Select all rows on this page". */
  allLabel?: string;
}

export interface DataTableProps<T> {
  /** Names the table (a visually hidden caption) and its scroll region. */
  caption: string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** The row's name: its checkbox is "Select <label>", and `renderActions` gets it. */
  rowLabel: (row: T) => string;
  sort?: DataTableSort;
  /** Adds a checkbox column; the header checkbox is tri-state and covers this page only. */
  selection?: DataTableSelection;
  /** While the next page loads: the old rows stay, and the table is `aria-busy`. */
  busy?: boolean;
  /** Adds an Actions column, given the row and its label. */
  renderActions?: (row: T, label: string) => ReactNode;
  /** The focusable scroll region, for moving focus to the table (after a delete, say). */
  regionRef?: Ref<HTMLDivElement>;
}

// The Checkbox's ::after is a 44px hit area; the cell keeps a 44px row below `lg`. In the dense
// `lg` table the hit area shrinks to 32px (`lg:min-h-8`) so it never reaches the next row's box.
const BOX = 'lg:after:-inset-2';
const BOX_TARGET = 'flex min-h-11 min-w-11 items-center justify-center lg:min-h-8 lg:min-w-8';

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

interface SortHeaderProps {
  header: string;
  active: boolean;
  sortDir: SortDir;
  onSort: () => void;
}

const SortHeader: React.FC<SortHeaderProps> = ({ header, active, sortDir, onSort }) => {
  const Icon = !active ? ChevronsUpDownIcon : sortDir === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead aria-sort={active ? ARIA_SORT[sortDir] : 'none'} className="px-0">
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'hover:bg-muted focus-visible:outline-ring inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-8',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {header}
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      </button>
    </TableHead>
  );
};
SortHeader.displayName = 'SortHeader';

/**
 * A selection box: the Checkbox named through `aria-labelledby` by sr-only text, which also keeps
 * the name in the header cell's text. `config.indeterminate` gives `aria-checked="mixed"`.
 */
const SelectBox: React.FC<{
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
}> = ({ label, checked, indeterminate = false, disabled, onChange }) => {
  const labelId = useId();
  return (
    <div className={BOX_TARGET}>
      <Checkbox
        className={BOX}
        aria-labelledby={labelId}
        value={checked}
        config={{ indeterminate }}
        disabled={disabled}
        onChange={() => onChange()}
      />
      <span id={labelId} className="sr-only">
        {label}
      </span>
    </div>
  );
};
SelectBox.displayName = 'SelectBox';

/**
 * One page of rows: a captioned table in a labelled, focusable scroll region. Optional selection
 * checkboxes, sortable headers (buttons with `aria-sort`), a busy state and an Actions column.
 * Sorting and selection are controlled; the parent fetches and orders the rows.
 */
export const DataTable = <T,>({
  caption,
  columns,
  rows,
  rowKey,
  rowLabel,
  sort,
  selection,
  busy = false,
  renderActions,
  regionRef,
}: DataTableProps<T>) => {
  const captionId = useId();

  const pageKeys = rows.map(rowKey);
  const selected = selection?.selected;
  const selectedOnPage = selected ? pageKeys.filter((key) => selected.has(key)).length : 0;
  const allSelected = pageKeys.length > 0 && selectedOnPage === pageKeys.length;

  const toggleAll = () => selection?.onSelectedChange(allSelected ? new Set() : new Set(pageKeys));
  const toggle = (key: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onSelectedChange(next);
  };
  const sortBy = (key: string) => {
    if (!sort) return;
    const flip = key === sort.orderBy;
    sort.onSortChange(key, flip && sort.sortDir === 'desc' ? 'asc' : 'desc');
  };

  return (
    <div
      ref={regionRef}
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="focus-visible:outline-ring relative w-full overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2"
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
            {selection && (
              <TableHead className="w-11 px-1">
                <SelectBox
                  label={selection.allLabel ?? 'Select all rows on this page'}
                  checked={allSelected}
                  indeterminate={selectedOnPage > 0 && !allSelected}
                  disabled={pageKeys.length === 0}
                  onChange={toggleAll}
                />
              </TableHead>
            )}
            {columns.map((column) =>
              sort && column.sortable ? (
                <SortHeader
                  key={column.key}
                  header={column.header}
                  active={column.key === sort.orderBy}
                  sortDir={sort.sortDir}
                  onSort={() => sortBy(column.key)}
                />
              ) : (
                <TableHead key={column.key} className="text-muted-foreground">
                  {column.header}
                </TableHead>
              ),
            )}
            {renderActions && (
              <TableHead className="w-11">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = rowKey(row);
            const label = rowLabel(row);
            const isSelected = selected?.has(key) ?? false;
            return (
              <TableRow key={key} data-state={isSelected ? 'selected' : undefined}>
                {selection && (
                  <TableCell className="px-1">
                    <SelectBox
                      label={`Select ${label}`}
                      checked={isSelected}
                      onChange={() => toggle(key)}
                    />
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell key={column.key} className={column.cellClassName}>
                    {column.cell(row)}
                  </TableCell>
                ))}
                {renderActions && (
                  <TableCell className="text-right">{renderActions(row, label)}</TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </table>
    </div>
  );
};
DataTable.displayName = 'DataTable';
