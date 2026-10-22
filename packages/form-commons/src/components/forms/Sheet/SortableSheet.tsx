import * as React from 'react';
import { cn } from 'cn';

import { Checkbox } from '@/components/ui/checkbox';

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
  labels: SortableSheetLabels;
  /** Dims the rows while a new page or sort loads. */
  busy?: boolean | undefined;
  className?: string | undefined;
}

const ARIA_SORT = {
  asc: 'ascending',
  desc: 'descending',
} as const;

/** Next sort when a header is clicked: new key ascending, same key flips. */
function nextSort(
  current: SheetSort | null | undefined,
  key: string,
): SheetSort {
  if (current?.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: 'asc' };
}

function SortIndicator({
  direction,
}: {
  direction: SheetSortDirection | null;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('size-3.5', direction === null && 'opacity-40')}
    >
      {direction === 'asc' ? (
        <path d="M8 13V3M4 7l4-4 4 4" />
      ) : direction === 'desc' ? (
        <path d="M8 3v10M4 9l4 4 4-4" />
      ) : (
        <path d="M5 6l3-3 3 3M5 10l3 3 3-3" />
      )}
    </svg>
  );
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
  const selectable = onSelectedChange !== undefined;
  const selected = selectedIds ?? new Set<string>();
  const ids = rows.map(getRowId);
  const selectedCount = ids.filter((id) => selected.has(id)).length;
  const allSelected = ids.length > 0 && selectedCount === ids.length;

  const toggleAll = () => {
    if (onSelectedChange === undefined) return;
    const next = new Set(selected);
    for (const id of ids) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }
    onSelectedChange(next);
  };
  const toggleRow = (id: string) => {
    if (onSelectedChange === undefined) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

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
            {selectable ? (
              <th scope="col" className="w-10 px-3 py-2">
                <Checkbox
                  aria-label={labels.selectAll}
                  checked={
                    allSelected
                      ? true
                      : selectedCount > 0
                        ? 'indeterminate'
                        : false
                  }
                  disabled={ids.length === 0}
                  onCheckedChange={toggleAll}
                />
              </th>
            ) : null}
            {columns.map((column) => {
              const active = sort?.key === column.key ? sort.direction : null;
              const sortable =
                column.sortable === true && onSortChange !== undefined;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sortable && active !== null ? ARIA_SORT[active] : undefined
                  }
                  className={cn(
                    'px-3 py-2 font-medium',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(nextSort(sort, column.key))}
                      className={cn(
                        'inline-flex cursor-pointer items-center gap-1 rounded-sm font-medium outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        active !== null && 'text-foreground',
                      )}
                    >
                      {column.header}
                      <SortIndicator direction={active} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            const isSelected = selected.has(id);
            return (
              <tr
                key={id}
                data-state={isSelected ? 'selected' : undefined}
                className="border-t border-border data-[state=selected]:bg-accent"
              >
                {selectable ? (
                  <td className="w-10 px-3 py-2">
                    <Checkbox
                      aria-label={labels.selectRow(getRowLabel(row))}
                      checked={isSelected}
                      onCheckedChange={() => toggleRow(id)}
                    />
                  </td>
                ) : null}
                {columns.map((column) => {
                  const Cell = column.rowHeader === true ? 'th' : 'td';
                  return (
                    <Cell
                      key={column.key}
                      scope={column.rowHeader === true ? 'row' : undefined}
                      className={cn(
                        'px-3 py-2',
                        column.rowHeader === true
                          ? 'text-left font-medium'
                          : 'text-muted-foreground',
                        column.align === 'right' && 'text-right tabular-nums',
                      )}
                    >
                      {column.renderCell(row)}
                    </Cell>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { SortableSheet };
