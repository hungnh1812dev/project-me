import { useState } from 'react';

import { Field } from '../../components/forms/Field';
import { Switch } from '../../components/ui/switch';
import { Section } from './Section';

/** The UI kit's Switch section: off, on, disabled, error, required (AC-9), on local state. */
export const SwitchSection: React.FC = () => {
  const [notifications, setNotifications] = useState(false);
  const [published, setPublished] = useState(true);
  const [terms, setTerms] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <Section title="Switch">
      <Field label="Notifications">
        <Switch name="notifications" value={notifications} onChange={setNotifications} />
      </Field>
      <Field label="Published">
        <Switch value={published} onChange={setPublished} />
      </Field>
      <Field label="Disabled switch">
        <Switch value={false} onChange={() => {}} disabled />
      </Field>
      <Field label="Accept terms" error="You must accept the terms.">
        <Switch value={terms} onChange={setTerms} />
      </Field>
      <Field label="Visible" required>
        <Switch value={visible} onChange={setVisible} />
      </Field>
    </Section>
  );
};
SwitchSection.displayName = 'SwitchSection';
