import { useId } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { Button } from '@repo/ui/components/button';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { lastPage, PAGE_SIZES, type PageSize } from '@/features/content/listState';

export interface PaginationBarProps {
  /** 1-based. */
  page: number;
  size: PageSize;
  total: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: PageSize) => void;
}

const SIZE_ITEMS = PAGE_SIZES.map((size) => ({ value: size, label: String(size) }));

/**
 * The list footer (SPEC "Pagination"): "Showing a–b of n", Previous and Next (disabled at the
 * ends), "Page x of y" and the page-size select.
 */
export const PaginationBar: React.FC<PaginationBarProps> = ({
  page,
  size,
  total,
  onPageChange,
  onSizeChange,
}) => {
  const sizeId = useId();
  const last = lastPage(total, size);
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const range = total === 0 ? 'Showing 0 of 0' : `Showing ${from}–${to} of ${total}`;

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
            items={SIZE_ITEMS}
            value={size}
            onValueChange={(value) => {
              if (value !== null) onSizeChange(value);
            }}
          >
            <SelectTrigger aria-labelledby={sizeId} className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <span className="min-w-24 px-1 text-center tabular-nums">
            Page {page} of {last}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next page"
            disabled={page >= last}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
};
PaginationBar.displayName = 'PaginationBar';
