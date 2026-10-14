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
        value={text}
        onChange={setText}
        onValidate={setError}
        config={{ label: 'Metadata', expect: 'object' }}
      />
    </Field>
  );
};
JsonDemo.displayName = 'JsonDemo';

/** A fixed text the parent never changes (disabled and read-only editors). */
const noop = () => {};

/**
 * The UI kit's JsonInput section: controlled, filled, disabled, read-only, invalid, required
 * (AC-9), on local state.
 */
export const JsonInputSection: React.FC = () => {
  const [settings, setSettings] = useState('{"theme":"dark"}');
  const [invalid, setInvalid] = useState('x');
  const [schema, setSchema] = useState('');

  return (
    <Section title="JsonInput">
      <JsonDemo />
      <Field label="Settings">
        <JsonInput value={settings} onChange={setSettings} config={{ label: 'Settings' }} />
      </Field>
      <Field label="Disabled JSON">
        <JsonInput
          value='{"locked":true}'
          onChange={noop}
          disabled
          config={{ label: 'Disabled JSON' }}
        />
      </Field>
      <Field label="Read-only JSON">
        <JsonInput
          value='{"fixed":true}'
          onChange={noop}
          readOnly
          config={{ label: 'Read-only JSON' }}
        />
      </Field>
      <Field label="Invalid JSON" error='Invalid JSON: Unexpected token "x"'>
        <JsonInput value={invalid} onChange={setInvalid} config={{ label: 'Invalid JSON' }} />
      </Field>
      <Field label="Schema" required>
        <JsonInput value={schema} onChange={setSchema} config={{ label: 'Schema' }} />
      </Field>
    </Section>
  );
};
JsonInputSection.displayName = 'JsonInputSection';
