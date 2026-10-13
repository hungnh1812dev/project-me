import { cn } from '../../lib/cn';

/**
 * A labelled swatch for each colour token (AC-9). Literal classes for Tailwind. Fill swatches
 * carry their name on the colour; `border` and `input` are boundary colours, so their name sits
 * beside the block in `text-foreground` to keep 4.5:1.
 */
const SWATCHES = [
  { name: 'primary', className: 'border-primary-ink bg-primary text-primary-foreground' },
  {
    name: 'primary-ink',
    className: 'border-primary-ink bg-primary-ink text-highlight-foreground',
  },
  { name: 'secondary', className: 'bg-secondary text-secondary-foreground' },
  { name: 'accent', className: 'bg-accent text-accent-foreground' },
  { name: 'highlight', className: 'bg-highlight text-highlight-foreground' },
  { name: 'destructive', className: 'bg-destructive text-destructive-foreground' },
  { name: 'success', className: 'bg-success text-success-foreground' },
  { name: 'warning', className: 'bg-warning text-warning-foreground' },
  { name: 'muted', className: 'bg-muted text-muted-foreground' },
  { name: 'border', className: 'bg-border', beside: true },
  { name: 'input', className: 'bg-input', beside: true },
] as const;

/** The UI kit's Colour section: 11 swatches, each with its `data-swatch` and name (AC-9). */
export const ColourSection: React.FC = () => (
  <section aria-labelledby="ui-kit-Colour" className="flex flex-col gap-4">
    <h2 id="ui-kit-Colour" className="text-lg font-semibold">
      Colour
    </h2>
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {SWATCHES.map((swatch) =>
        'beside' in swatch ? (
          <div
            key={swatch.name}
            className="text-foreground flex items-center gap-3 rounded-lg border px-4 py-6 font-mono text-sm"
          >
            <span
              aria-hidden="true"
              data-swatch={swatch.name}
              className={cn('size-8 shrink-0 rounded-md', swatch.className)}
            />
            <span>{swatch.name}</span>
          </div>
        ) : (
          <div
            key={swatch.name}
            data-swatch={swatch.name}
            className={cn('rounded-lg border px-4 py-6 font-mono text-sm', swatch.className)}
          >
            {swatch.name}
          </div>
        ),
      )}
    </div>
  </section>
);
ColourSection.displayName = 'ColourSection';
