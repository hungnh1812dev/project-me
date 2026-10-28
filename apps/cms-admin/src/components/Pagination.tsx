import { TablePagination } from '@abyss/form-commons';

import type { PageMeta } from '../lib/Api.client';

export interface PaginationCopy {
  label: string;
  range: (from: number, to: number, total: number) => string;
  previous: string;
  next: string;
}

/** The kit `TablePagination`, driven by the API's `meta`. */
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
  return (
    <TablePagination
      page={meta.page}
      pageSize={meta.pageSize}
      total={meta.total}
      count={count}
      onPageChange={onPage}
      labels={{
        nav: copy.label,
        previous: copy.previous,
        next: copy.next,
        range: copy.range,
      }}
    />
  );
}
