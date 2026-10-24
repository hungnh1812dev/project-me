import { Button, FormAlert } from '@abyss/form-commons';
import type { ReactNode } from 'react';

import { COPY } from '../config/copy.constants';

/** Skeleton rows shown while a table loads. */
const TABLE_SKELETON_ROWS = 3;

/** Page title block of a list page. */
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
        {COPY.common.retry}
      </Button>
    </div>
  );
}
