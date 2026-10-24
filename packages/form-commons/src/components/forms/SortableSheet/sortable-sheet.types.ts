import type * as React from 'react';

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
