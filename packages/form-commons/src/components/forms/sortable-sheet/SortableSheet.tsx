import { cn } from 'cn';
import type * as React from 'react';

import { Checkbox } from '@/components/ui/Checkbox';

import { SheetHeaderCell } from './SheetHeaderCell';
import { SheetRow } from './SheetRow';
import { useRowSelection } from './useRowSelection';

export type SheetSortDirection = 'asc' | 'desc';

export interface SheetSort {
  key: string;
  direction: SheetSortDirection;
}

export interface SheetColumn<TRow> {
  /** Stable id; also the key reported to `onSortChange`. */
  key: string;
  header: React.ReactNode;
  renderCell: (row: TRow) => React.ReactNode;
  sortable?: boolean | undefined;
  /** Numbers read best right-aligned. */
  align?: 'left' | 'right' | undefined;
  /** The cell becomes the row's `th` (the row's name for screen readers). */
  rowHeader?: boolean | undefined;
}

export interface SortableSheetLabels {
  selectAll: string;
  /** `rowLabel(row)` goes in: "Select Ada Lovelace". */
  selectRow: (rowLabel: string) => string;
}

export interface SortableSheetProps<TRow> {
  /** Accessible name of the table (visually hidden). */
  caption: string;
  columns: readonly SheetColumn<TRow>[];
  rows: readonly TRow[];
  getRowId: (row: TRow) => string;
  /** Text naming a row, used in the checkbox label. */
  getRowLabel: (row: TRow) => string;
  sort?: SheetSort | null | undefined;
  onSortChange?: ((sort: SheetSort) => void) | undefined;
  /** Shows a checkbox column when `onSelectedChange` is given. */
  selectedIds?: ReadonlySet<string> | undefined;
  onSelectedChange?: ((next: Set<string>) => void) | undefined;
  /** Needed only when the sheet is selectable. */
  labels?: SortableSheetLabels | undefined;
  /** Dims the rows while a new page or sort loads. */
  busy?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Data table with optional sortable headers and row selection. Sorting is
 * reported, not applied: the parent sorts (usually on the server) and passes
 * `rows` in order. Selection is by row id.
 */
function SortableSheet<TRow>({
  caption,
  columns,
  rows,
  getRowId,
  getRowLabel,
  sort,
  onSortChange,
  selectedIds,
  onSelectedChange,
  labels,
  busy = false,
  className,
}: SortableSheetProps<TRow>) {
  const selection = useRowSelection(
    rows.map(getRowId),
    selectedIds,
    onSelectedChange,
  );

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-md border border-border bg-card',
        className,
      )}
    >
      <table
        aria-busy={busy || undefined}
        className={cn(
          'w-full border-collapse text-sm transition-opacity',
          busy && 'opacity-60',
        )}
      >
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted text-left text-muted-foreground">
          <tr>
            {selection.isSelectable ? (
              <th scope="col" className="w-10 px-3 py-2">
                <Checkbox
                  aria-label={labels?.selectAll}
                  checked={selection.checkedState}
                  disabled={rows.length === 0}
                  onCheckedChange={selection.toggleAll}
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <SheetHeaderCell
                key={column.key}
                column={column}
                sort={sort}
                onSortChange={onSortChange}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            return (
              <SheetRow
                key={id}
                row={row}
                columns={columns}
                isSelected={selection.isSelected(id)}
                selection={
                  selection.isSelectable
                    ? {
                        checkboxLabel: labels?.selectRow(getRowLabel(row)),
                        onToggle: () => selection.toggleRow(id),
                      }
                    : undefined
                }
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { SortableSheet };
