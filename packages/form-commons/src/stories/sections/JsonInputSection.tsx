import { useState } from 'react';

import { Field } from '../../components/forms/Field';
import { JsonInput } from '../../components/forms/JsonInput';
import { Section } from './Section';

/** A controlled JsonInput in a Field, as pages wire it. */
const JsonDemo: React.FC = () => {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Field label="Metadata" description="A JSON object." error={error}>
      <JsonInput
        label="Metadata"
        value={text}
        onChange={setText}
        onValidate={setError}
        expect="object"
      />
    </Field>
  );
};
JsonDemo.displayName = 'JsonDemo';

/** The UI kit's JsonInput section: controlled, filled, disabled, read-only, invalid, required (AC-9). */
export const JsonInputSection: React.FC = () => (
  <Section title="JsonInput">
    <JsonDemo />
    <Field label="Settings">
      <JsonInput label="Settings" defaultValue='{"theme":"dark"}' />
    </Field>
    <Field label="Disabled JSON">
      <JsonInput label="Disabled JSON" disabled defaultValue='{"locked":true}' />
    </Field>
    <Field label="Read-only JSON">
      <JsonInput label="Read-only JSON" readOnly defaultValue='{"fixed":true}' />
    </Field>
    <Field label="Invalid JSON" error='Invalid JSON: Unexpected token "x"'>
      <JsonInput label="Invalid JSON" defaultValue="x" />
    </Field>
    <Field label="Schema" required>
      <JsonInput label="Schema" />
    </Field>
  </Section>
);
JsonInputSection.displayName = 'JsonInputSection';
