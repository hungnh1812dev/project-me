import * as React from 'react';
import { cn } from 'cn';

import { Button, type ButtonProps } from '@/components/ui/button';

export interface BulkAction {
  id: string;
  label: string;
  /** Follows the action's meaning: success, warning, destructive... */
  variant?: ButtonProps['variant'];
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  onClick: () => void;
}

export interface BulkActionBarLabels {
  /** Accessible name of the region. */
  region: string;
  /** "3 selected". */
  selected: (count: number) => string;
  clear: string;
}

export interface BulkActionBarProps {
  selectedCount: number;
  actions: readonly BulkAction[];
  onClear: () => void;
  labels: BulkActionBarLabels;
  /** Disables clearing and the actions while a bulk request runs. */
  busy?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Toolbar over a table with the count of selected rows and what can be done
 * with them. Renders nothing while no row is selected.
 */
function BulkActionBar({
  selectedCount,
  actions,
  onClear,
  labels,
  busy = false,
  className,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;
  return (
    <section
      aria-label={labels.region}
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-muted px-3 py-2',
        className,
      )}
    >
      <output className="text-sm font-medium tabular-nums">
        {labels.selected(selectedCount)}
      </output>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant={action.variant ?? 'secondary'}
            disabled={busy || action.disabled}
            loading={action.loading ?? false}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="ml-auto"
        disabled={busy}
        onClick={onClear}
      >
        {labels.clear}
      </Button>
    </section>
  );
}

export { BulkActionBar };
