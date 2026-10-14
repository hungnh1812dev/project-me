import { useState } from 'react';

import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import { Section } from './Section';

const BOXES = [
  { id: 'ui-kit-subscribe', label: 'Subscribe', initial: false },
  { id: 'ui-kit-checked', label: 'Checked', initial: true },
  { id: 'ui-kit-mixed', label: 'Some selected', initial: false, indeterminate: true },
  { id: 'ui-kit-checkbox-disabled', label: 'Disabled checkbox', initial: false, disabled: true },
] as const;

/** The UI kit's Checkbox section: unchecked, checked, mixed, disabled (AC-9), on local state. */
export const CheckboxSection: React.FC = () => {
  const [values, setValues] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BOXES.map(({ id, initial }) => [id, initial])),
  );

  return (
    <Section title="Checkbox">
      {BOXES.map((box) => (
        <div key={box.id} className="flex items-center gap-2">
          <Checkbox
            id={box.id}
            value={values[box.id] ?? false}
            onChange={(next) => setValues((current) => ({ ...current, [box.id]: next }))}
            config={'indeterminate' in box ? { indeterminate: box.indeterminate } : undefined}
            disabled={'disabled' in box ? box.disabled : undefined}
          />
          <Label htmlFor={box.id}>{box.label}</Label>
        </div>
      ))}
    </Section>
  );
};
CheckboxSection.displayName = 'CheckboxSection';
