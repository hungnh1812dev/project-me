import * as React from 'react';
import { cn } from 'cn';
import { Radio } from '@/components/ui/radio';

export type DiffSide = 'server' | 'client';

export interface DiffViewerOption {
  /** Short name of the side ("Saved version", "Your version"). */
  label: string;
  /** What this side holds. `null` renders `emptyText`. */
  content: React.ReactNode | null;
}

export interface DiffViewerBlockProps {
  /** Radio group name, unique on the page. */
  name: string;
  /** What differs ("Position", "Skill 2 > Level"). */
  title: string;
  /** Kind of difference ("Changed", "Added", "Removed", "Moved"). */
  changeLabel: string;
  server: DiffViewerOption;
  client: DiffViewerOption;
  choice: DiffSide;
  onChoiceChange: (side: DiffSide) => void;
  /** Shown for a side with no value. */
  emptyText: string;
  className?: string | undefined;
}

const SIDES: readonly DiffSide[] = ['server', 'client'];

/**
 * One difference between two versions of a value. Each side is a radio
 * card; the chosen side is outlined and tinted. Values are rendered as
 * text by the caller (`content`), never as HTML.
 */
function DiffViewerBlock({
  name,
  title,
  changeLabel,
  server,
  client,
  choice,
  onChoiceChange,
  emptyText,
  className,
}: DiffViewerBlockProps) {
  const options: Record<DiffSide, DiffViewerOption> = { server, client };
  return (
    <fieldset
      data-slot="diff-viewer-block"
      className={cn(
        'm-0 grid min-w-0 gap-2 rounded-md border border-border bg-card p-3',
        className,
      )}
    >
      <legend className="sr-only">{title}</legend>
      <div className="flex items-center justify-between gap-2" aria-hidden>
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {changeLabel}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SIDES.map((side) => {
          const option = options[side];
          const selected = choice === side;
          return (
            <label
              key={side}
              className={cn(
                'grid min-w-0 cursor-pointer content-start gap-1 rounded-md border p-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                selected
                  ? 'border-primary bg-info-soft'
                  : 'border-border bg-background hover:bg-muted',
              )}
            >
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Radio
                  name={name}
                  value={side}
                  checked={selected}
                  onChange={() => onChoiceChange(side)}
                />
                {option.label}
              </span>
              <span className="min-w-0 break-words whitespace-pre-wrap text-foreground">
                {option.content === null ? (
                  <span className="text-muted-foreground">{emptyText}</span>
                ) : (
                  option.content
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export { DiffViewerBlock };
