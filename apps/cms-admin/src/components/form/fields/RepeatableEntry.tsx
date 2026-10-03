import { useId } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';

import { Button } from '@repo/ui/components/button';

/** The entry buttons, found by `data-action` when focus moves after a change. */
export type EntryAction = 'up' | 'down' | 'remove';

export interface RepeatableEntryProps {
  /** "Gallery item 2": the group's accessible name and the start of each button name. */
  label: string;
  /** A short preview of the entry (its header or first text value), or `null`. */
  hint: string | null;
  /** `undefined` disables the button (first entry, last entry). */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove: () => void;
  /** Hides the buttons. */
  readOnly: boolean;
  /** The entry's fields. */
  children: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
}

/** One item of a `RepeatableField`: a labelled group with Move up, Move down and Remove buttons. */
export const RepeatableEntry: React.FC<RepeatableEntryProps> = ({
  label,
  hint,
  onMoveUp,
  onMoveDown,
  onRemove,
  readOnly,
  children,
  ref,
}) => {
  const id = useId();
  const titleId = `${id}-title`;
  const hintId = `${id}-hint`;
  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={titleId}
      aria-describedby={hint === null ? undefined : hintId}
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
          <span id={titleId} className="shrink-0 font-medium">
            {label}
          </span>
          {hint !== null && (
            <span id={hintId} className="min-w-0 truncate text-muted-foreground">
              {hint}
            </span>
          )}
        </div>
        {!readOnly && (
          <div data-slot="entry-actions" className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              data-action="up"
              aria-label={`Move ${label} up`}
              disabled={onMoveUp === undefined}
              onClick={onMoveUp}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-action="down"
              aria-label={`Move ${label} down`}
              disabled={onMoveDown === undefined}
              onClick={onMoveDown}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-action="remove"
              aria-label={`Remove ${label}`}
              onClick={onRemove}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
      <div data-slot="entry-fields">{children}</div>
    </div>
  );
};
RepeatableEntry.displayName = 'RepeatableEntry';
