import type { ReactNode } from 'react';
import { Button, Card, FormAlert } from '@abyss/form-commons';
import { COMMON_TEXT } from '@configs/locales';

/** Skeleton rows shown while a table loads. */
const TABLE_SKELETON_ROWS = 3;

/** Page title block of a list page. */
export function PageHeader({
  title,
  description,
  badge,
  action,
}: {
  title: ReactNode;
  description: ReactNode;
  /** Small status shown right after the title, outside the heading text. */
  badge?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1
            tabIndex={-1}
            className="m-0 text-2xl font-bold tracking-tight break-words text-foreground outline-none sm:text-3xl"
          >
            {title}
          </h1>
          {badge}
        </div>
        <p className="m-0 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Stands in for a page title that is not known yet; announces `label` to screen readers. */
export function TitleSkeleton({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" className="block h-8 w-48 animate-pulse rounded-item bg-muted" />
      <span className="sr-only">{label}</span>
    </>
  );
}

/** Rows of grey bars shaped like the table that is loading. */
export function TableSkeleton({ label }: { label: string }) {
  return (
    <Card
      padding="flush"
      aria-busy="true"
      aria-live="polite"
      className="grid gap-px overflow-hidden shadow-card"
    >
      <span className="sr-only">{label}</span>
      <div className="h-11 border-b border-border bg-muted/60" />
      {Array.from({ length: TABLE_SKELETON_ROWS }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-border/50 bg-card px-4 py-3.5 last:border-b-0"
        >
          <div className="h-4 w-1/3 animate-pulse rounded-item bg-muted" />
          <div className="h-4 w-1/6 animate-pulse rounded-item bg-muted" />
          <div className="h-4 w-1/6 animate-pulse rounded-item bg-muted" />
        </div>
      ))}
    </Card>
  );
}

/** Nothing to show yet, or a feature not configured: a title, an optional hint and icon in a card. */
export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: ReactNode;
  hint?: ReactNode;
  /** Decorative icon above the title; the caller sets `aria-hidden`. */
  icon?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 py-12 text-center shadow-card">
      {icon ? <div className="text-muted-foreground/60">{icon}</div> : null}
      <p className="m-0 text-sm font-semibold text-foreground">{title}</p>
      {hint === undefined ? null : (
        <p className="m-0 max-w-sm text-xs text-muted-foreground">{hint}</p>
      )}
    </Card>
  );
}

/** Failed load with a retry. */
export function LoadError({
  message,
  onRetry,
  isRetrying,
}: {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <div className="grid justify-items-start gap-3">
      <FormAlert tone="error">{message}</FormAlert>
      <Button type="button" loading={isRetrying} onClick={onRetry}>
        {COMMON_TEXT.common.retry}
      </Button>
    </div>
  );
}
