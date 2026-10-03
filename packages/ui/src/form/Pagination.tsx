'use client';

import { useEffect, useId, useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { Button } from '../components/button';
import { Label } from '../components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/select';
import { lastPage } from '../lib/pagination';

/** The page sizes offered when a list doesn't pass its own. */
const DEFAULT_PAGE_SIZES = [10, 20, 50, 100] as const;

export interface PaginationProps {
  /** 1-based. */
  page: number;
  size: number;
  total: number;
  /** The "Rows per page" options. Defaults to 10, 20, 50 and 100. */
  sizes?: readonly number[];
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
}

type Step = 'previous' | 'next';

/**
 * A list footer (AC-18): "Showing a–b of n", the "Rows per page" select, Previous and Next
 * (disabled at the ends) and "Page x of y", with the current page marked in `highlight` (AC-14).
 * Focus stays on the control used; when Previous or Next becomes disabled by its own step, focus
 * moves to the other button (AC-27).
 */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  size,
  total,
  sizes = DEFAULT_PAGE_SIZES,
  onPageChange,
  onSizeChange,
}) => {
  const sizeId = useId();
  const last = lastPage(total, size);
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const range = total === 0 ? 'Showing 0 of 0' : `Showing ${from}–${to} of ${total}`;
  const items = sizes.map((value) => ({ value, label: String(value) }));

  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const stepped = useRef<Step | null>(null);

  // After a step re-renders with the new page, a button that is now disabled hands focus over.
  useEffect(() => {
    const step = stepped.current;
    stepped.current = null;
    if (step === 'next' && page >= last) previousRef.current?.focus();
    if (step === 'previous' && page <= 1) nextRef.current?.focus();
  }, [page, last]);

  const go = (step: Step) => {
    stepped.current = step;
    onPageChange(step === 'next' ? page + 1 : page - 1);
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-muted-foreground tabular-nums">{range}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label id={sizeId} className="font-normal text-muted-foreground">
            Rows per page
          </Label>
          <Select
            items={items}
            value={size}
            onValueChange={(value) => {
              if (value !== null) onSizeChange(value);
            }}
          >
            <SelectTrigger aria-labelledby={sizeId} className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            ref={previousRef}
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => go('previous')}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <span data-testid="pagination-page" className="min-w-24 px-1 text-center tabular-nums">
            Page{' '}
            <span
              data-testid="pagination-current"
              className="inline-block min-w-6 rounded-sm bg-highlight px-1 font-medium text-highlight-foreground"
            >
              {page}
            </span>{' '}
            of {last}
          </span>
          <Button
            ref={nextRef}
            variant="outline"
            size="icon"
            aria-label="Next page"
            disabled={page >= last}
            onClick={() => go('next')}
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
};
Pagination.displayName = 'Pagination';
