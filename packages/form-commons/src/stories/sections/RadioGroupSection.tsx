import { useState } from 'react';

import { RadioGroup } from '../../components/ui/radio-group';
import type { InputOption } from '../../lib/inputContract';
import { Section } from './Section';

const DENSITY_OPTIONS: InputOption[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
  { value: 'spacious', label: 'Spacious' },
];

/** The UI kit's RadioGroup section: "Density" with three options (AC-9), on local state. */
export const RadioGroupSection: React.FC = () => {
  const [density, setDensity] = useState<string | null>('comfortable');

  return (
    <Section title="RadioGroup">
      <RadioGroup
        aria-label="Density"
        value={density}
        onChange={setDensity}
        config={{ options: DENSITY_OPTIONS }}
      />
    </Section>
  );
};
RadioGroupSection.displayName = 'RadioGroupSection';
