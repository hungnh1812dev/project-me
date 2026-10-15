import { useState } from 'react';

import { Field } from '../../components/native/Field';
import { Select } from '../../components/ui/select';
import type { InputOption } from '../../lib/inputContract';
import { Section } from './Section';

const EXPIRY_OPTIONS: InputOption[] = [
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '1y', label: '1 year' },
];

/** The UI kit's Select section: "Expires in" and "Disabled select" (AC-9), on local state. */
export const SelectSection: React.FC = () => {
  const [expiry, setExpiry] = useState<string | null>('1d');
  const [disabledExpiry, setDisabledExpiry] = useState<string | null>('1h');

  return (
    <Section title="Select">
      <Field label="Expires in">
        <Select value={expiry} onChange={setExpiry} config={{ options: EXPIRY_OPTIONS }} />
      </Field>
      <Field label="Disabled select">
        <Select
          value={disabledExpiry}
          onChange={setDisabledExpiry}
          config={{ options: EXPIRY_OPTIONS }}
          disabled
        />
      </Field>
    </Section>
  );
};
SelectSection.displayName = 'SelectSection';
