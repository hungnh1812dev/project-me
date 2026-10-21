import { Button } from '@abyss/form-commons';
import type { ReactNode } from 'react';

import { TABLE_SKELETON_ROWS } from '../../config/access.constants';
import { COPY } from '../../config/copy.constants';
import { FormAlert } from '../auth/FormAlert';
import type { PageMeta } from './access.api';

/** Page title block of the access pages. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid gap-2">
        <h1
          tabIndex={-1}
          className="m-0 text-2xl font-semibold tracking-tight outline-none"
        >
          {title}
        </h1>
        <p className="m-0 max-w-prose text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Rows of grey bars shaped like the table that is loading. */
export function TableSkeleton({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="grid gap-px overflow-hidden rounded-md border border-border bg-border"
    >
      <span className="sr-only">{label}</span>
      <div className="h-10 bg-muted" />
      {Array.from({ length: TABLE_SKELETON_ROWS }, (_, index) => (
        <div key={index} className="flex items-center gap-4 bg-card px-3 py-3">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/6 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/6 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Failed load with a retry. */
export function LoadError({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="grid justify-items-start gap-3">
      <FormAlert tone="error">{message}</FormAlert>
      <Button type="button" loading={retrying} onClick={onRetry}>
        {COPY.access.errors.retry}
      </Button>
    </div>
  );
}

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
