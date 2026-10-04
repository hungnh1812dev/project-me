import { XIcon } from 'lucide-react';

import type { ColumnCatalog } from '@/features/content/columns';
import { filterChipLabel } from '@/features/content/filterLabels';
import type { ListFilter } from '@/features/content/listState';

export interface FilterChipsProps {
  catalog: ColumnCatalog;
  filters: Record<string, ListFilter>;
  onRemove: (field: string) => void;
  locale?: string;
}

/** The active filters as named, removable chips ("Featured is Yes, remove"). Nothing when none. */
export const FilterChips: React.FC<FilterChipsProps> = ({ catalog, filters, onRemove, locale }) => {
  const entries = Object.entries(filters);
  if (entries.length === 0) return null;
  return (
    <ul aria-label="Active filters" className="flex flex-wrap gap-2">
      {entries.map(([field, filter]) => {
        const label = filterChipLabel(catalog, field, filter, locale);
        return (
          <li key={field}>
            <button
              type="button"
              aria-label={`${label}, remove`}
              onClick={() => onRemove(field)}
              className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border bg-secondary px-3 text-sm text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:min-h-8"
            >
              <span className="truncate">{label}</span>
              <XIcon aria-hidden="true" className="size-3.5 shrink-0" />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
FilterChips.displayName = 'FilterChips';
