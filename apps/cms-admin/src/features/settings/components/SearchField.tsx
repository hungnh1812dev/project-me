import { SearchIcon } from 'lucide-react';

import { Field } from '@/components/form/Field';
import { Input } from '@/components/ui/input';

import type { Noun } from './ListState';

export interface SearchFieldProps {
  noun: Noun;
  value: string;
  onChange: (value: string) => void;
  /** How many items match `value`; announced politely ("3 users"). */
  count: number;
  className?: string;
}

/** The client-side list filter (AC-4): a labelled `type="search"` box plus a live result count. */
export const SearchField: React.FC<SearchFieldProps> = ({
  noun,
  value,
  onChange,
  count,
  className,
}) => (
  <div className={className}>
    <Field label={`Search ${noun.other}`} hideLabel>
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Search ${noun.other}`}
        autoComplete="off"
        leading={<SearchIcon aria-hidden="true" />}
      />
    </Field>
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {count} {count === 1 ? noun.one : noun.other}
    </p>
  </div>
);
SearchField.displayName = 'SearchField';
