import { Button } from '@abyss/form-commons';

import type { PageMeta } from '../lib/api-types';

export interface PaginationCopy {
  label: string;
  range: (from: number, to: number, total: number) => string;
  previous: string;
  next: string;
}

/** Previous / next with "x-y of total"; driven by the API's `meta`. */
export function Pagination({
  meta,
  count,
  onPage,
  copy,
}: {
  meta: PageMeta;
  /** Rows on the current page. */
  count: number;
  onPage: (page: number) => void;
  copy: PaginationCopy;
}) {
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = from + count - 1;
  const hasNext = meta.page * meta.pageSize < meta.total;
  return (
    <nav
      aria-label={copy.label}
      className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm"
    >
      <span className="tabular-nums text-muted-foreground">
        {copy.range(from, to, meta.total)}
      </span>
      <span className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          {copy.previous}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!hasNext}
          onClick={() => onPage(meta.page + 1)}
        >
          {copy.next}
        </Button>
      </span>
    </nav>
  );
}
