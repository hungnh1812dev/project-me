import * as React from 'react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';

export interface TablePaginationLabels {
  /** Accessible name of the navigation landmark. */
  nav: string;
  previous: string;
  next: string;
  /** "21-40 of 95". */
  range: (from: number, to: number, total: number) => string;
}

export interface TablePaginationProps {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  /** Rows on the current page (the last page may be short). */
  count: number;
  onPageChange: (page: number) => void;
  labels: TablePaginationLabels;
  className?: string | undefined;
}

/** Previous / next with a "from-to of total" readout; the parent owns `page`. */
function TablePagination({
  page,
  pageSize,
  total,
  count,
  onPageChange,
  labels,
  className,
}: TablePaginationProps) {
  const from = (page - 1) * pageSize + 1;
  const to = from + count - 1;
  const hasNext = page * pageSize < total;
  return (
    <nav
      aria-label={labels.nav}
      className={cn(
        'flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm',
        className,
      )}
    >
      <span className="tabular-nums text-muted-foreground">
        {count === 0
          ? labels.range(0, 0, total)
          : labels.range(from, to, total)}
      </span>
      <span className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {labels.previous}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          {labels.next}
        </Button>
      </span>
    </nav>
  );
}

export { TablePagination };
