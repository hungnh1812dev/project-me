import { cn } from 'cn';

import type {
  SheetColumn,
  SheetSort,
  SheetSortDirection,
} from './SortableSheet';

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

interface SheetHeaderCellProps<TRow> {
  column: SheetColumn<TRow>;
  sort: SheetSort | null | undefined;
  onSortChange: ((sort: SheetSort) => void) | undefined;
}

function SheetHeaderCell<TRow>({
  column,
  sort,
  onSortChange,
}: SheetHeaderCellProps<TRow>) {
  const activeDirection = sort?.key === column.key ? sort.direction : null;
  const isSortable = column.sortable === true && onSortChange !== undefined;
  return (
    <th
      scope="col"
      aria-sort={
        isSortable && activeDirection !== null
          ? ARIA_SORT[activeDirection]
          : undefined
      }
      className={cn(
        'px-3 py-2 font-medium',
        column.align === 'right' && 'text-right',
      )}
    >
      {isSortable ? (
        <button
          type="button"
          onClick={() => onSortChange(nextSort(sort, column.key))}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1 rounded-sm font-medium outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
            activeDirection !== null && 'text-foreground',
          )}
        >
          {column.header}
          <SortIndicator direction={activeDirection} />
        </button>
      ) : (
        column.header
      )}
    </th>
  );
}

export { SheetHeaderCell };
