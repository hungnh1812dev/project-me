import { AlertCircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ApiError } from '@/core/api/apiError';

/** How a list names its items, for example `{ one: 'user', other: 'users' }`. */
export interface Noun {
  one: string;
  other: string;
}

export interface ListStateProps {
  isPending: boolean;
  error: ApiError | null;
  /** Retries the list request. */
  refetch: () => unknown;
  noun: Noun;
  /** Items before the search filter. */
  total: number;
  /** Items after the search filter. */
  visible: number;
  search: string;
  /** The primary action shown in the empty state, when the actor may use it. */
  emptyAction?: React.ReactNode;
  skeletonRows?: number;
  /** The list itself, rendered only when there are visible items. */
  children: React.ReactNode;
}

const MESSAGE = 'flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm';

/**
 * The four list states of every settings page (AC-3): loading skeleton (`aria-busy`), error with
 * Retry (a server 403 shows "no access" and no Retry), empty with the primary action, and a search
 * with no matches. Otherwise renders `children`.
 */
export const ListState: React.FC<ListStateProps> = ({
  isPending,
  error,
  refetch,
  noun,
  total,
  visible,
  search,
  emptyAction,
  skeletonRows = 3,
  children,
}) => {
  if (isPending)
    return (
      <div
        role="group"
        aria-busy="true"
        aria-label={`Loading ${noun.other}`}
        className="flex flex-col gap-2"
      >
        {Array.from({ length: skeletonRows }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );

  if (error) {
    const forbidden = error.status === 403;
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4 text-sm"
      >
        <p className="flex items-center gap-2 font-medium text-destructive">
          <AlertCircleIcon aria-hidden="true" className="size-4 shrink-0" />
          {forbidden ? `You don't have access to ${noun.other}.` : error.message}
        </p>
        {!forbidden && (
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (total === 0)
    return (
      <div className={MESSAGE}>
        <p className="text-muted-foreground">No {noun.other} yet.</p>
        {emptyAction}
      </div>
    );

  if (visible === 0)
    return (
      <div className={MESSAGE}>
        <p className="text-muted-foreground">
          No {noun.other} match &quot;{search.trim()}&quot;.
        </p>
      </div>
    );

  return <>{children}</>;
};
ListState.displayName = 'ListState';
